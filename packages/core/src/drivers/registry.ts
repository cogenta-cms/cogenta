import { CogentaError } from '../errors/index.js'
import { createLogger, type Logger } from '../logger/index.js'
import {
  DRIVER_TIERS,
  type Driver,
  type DriverChoice,
  type DriverSelection,
  type HealthReport,
  type SkippedDriver,
} from './types.js'

export interface DriverRegistryOptions {
  /** What this registry provides: `cache`, `queue`, `storage`, `database`. */
  readonly need: string
  readonly logger?: Logger
}

export interface DriverRegistry<TInstance, TConfig extends DriverChoice> {
  register(driver: Driver<TInstance, TConfig>): void
  /** Registered drivers, optimal first. Used by `cogenta doctor`. */
  list(): readonly Driver<TInstance, TConfig>[]
  select(config: TConfig): Promise<DriverSelection<TInstance>>
}

/** `auto`, like an absent value, means "you choose". */
function namedDriver(config: DriverChoice): string | undefined {
  const requested = config.driver
  return requested === undefined || requested === 'auto' ? undefined : requested
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Holds the implementations of one infrastructure need and picks between them.
 *
 * Two rules, and the difference between them matters more than it looks:
 *
 * - The configuration **names** a driver → that driver is used, and any failure
 *   is fatal. The operator asked for Redis; starting on the filesystem instead
 *   and saying nothing would be a silent, invisible downgrade of their site.
 * - The configuration names **nothing** → the first available driver wins, in
 *   tier order, and failures fall through. `npm create cogenta` must produce a
 *   working site with nothing else installed.
 */
export function createDriverRegistry<TInstance, TConfig extends DriverChoice>(
  options: DriverRegistryOptions,
): DriverRegistry<TInstance, TConfig> {
  const { need } = options
  const logger = (options.logger ?? createLogger()).child({ need })
  const drivers = new Map<string, Driver<TInstance, TConfig>>()

  function ordered(): Driver<TInstance, TConfig>[] {
    return DRIVER_TIERS.flatMap((tier) => [...drivers.values()].filter((d) => d.tier === tier))
  }

  function selection(
    driver: Driver<TInstance, TConfig>,
    instance: TInstance,
    requested: boolean,
    reason: string,
    skipped: readonly SkippedDriver[],
  ): DriverSelection<TInstance> {
    let disposed = false

    logger.info('driver selected', { driver: driver.name, tier: driver.tier, reason, requested })

    return {
      need,
      driver: driver.name,
      tier: driver.tier,
      instance,
      requested,
      reason,
      skipped,
      dispose: async () => {
        if (disposed) return
        disposed = true
        await driver.dispose()
      },
      health: (): Promise<HealthReport> => driver.health(),
    }
  }

  async function selectNamed(name: string, config: TConfig): Promise<DriverSelection<TInstance>> {
    const driver = drivers.get(name)
    if (driver === undefined) {
      const known = ordered().map((d) => d.name)
      throw new CogentaError({
        code: 'DRIVER_UNKNOWN',
        message: `No ${need} driver named "${name}".`,
        hint:
          known.length === 0
            ? `No ${need} driver is registered at all.`
            : `Available ${need} drivers: ${known.join(', ')}. Use "auto" to let Cogenta choose.`,
        details: { need, requested: name, known },
      })
    }

    let reachable: boolean
    try {
      reachable = await driver.available(config)
    } catch (error) {
      throw new CogentaError({
        code: 'DRIVER_UNAVAILABLE',
        message: `The ${need} driver "${name}" could not be reached: ${describe(error)}`,
        hint: `Start the service, fix its URL, or set ${need}.driver to "auto" to fall back automatically.`,
        cause: error,
        details: { need, driver: name },
      })
    }

    if (!reachable) {
      throw new CogentaError({
        code: 'DRIVER_UNAVAILABLE',
        message: `The ${need} driver "${name}" is configured but not available.`,
        hint: `Start the service, fix its URL, or set ${need}.driver to "auto" to fall back automatically.`,
        details: { need, driver: name },
      })
    }

    try {
      const instance = await driver.init(config)
      return selection(driver, instance, true, `named in the configuration`, [])
    } catch (error) {
      throw new CogentaError({
        code: 'DRIVER_INIT_FAILED',
        message: `The ${need} driver "${name}" failed to start: ${describe(error)}`,
        hint: `This driver was named in the configuration, so Cogenta will not fall back to another one on its own. Fix it, or set ${need}.driver to "auto".`,
        cause: error,
        details: { need, driver: name },
      })
    }
  }

  async function selectAutomatically(config: TConfig): Promise<DriverSelection<TInstance>> {
    const skipped: SkippedDriver[] = []

    for (const driver of ordered()) {
      const skip = (reason: string): void => {
        skipped.push({ driver: driver.name, tier: driver.tier, reason })
        logger.debug('driver skipped', { driver: driver.name, tier: driver.tier, reason })
      }

      try {
        if (!(await driver.available(config))) {
          skip('not available')
          continue
        }
      } catch (error) {
        skip(`not available: ${describe(error)}`)
        continue
      }

      try {
        const instance = await driver.init(config)
        const because =
          skipped.length === 0
            ? 'first available driver'
            : `${skipped.map((s) => `${s.driver} ${s.reason}`).join(', ')}`
        return selection(driver, instance, false, because, skipped)
      } catch (error) {
        // It answered the probe and failed anyway. Keep going: the site booting
        // on a degraded driver beats the site not booting.
        skip(`failed to start: ${describe(error)}`)
        logger.warn('driver failed to start, trying the next one', {
          driver: driver.name,
          error,
        })
      }
    }

    const tried = skipped.map((s) => `${s.driver} (${s.reason})`).join(', ')
    throw new CogentaError({
      code: 'DRIVER_UNAVAILABLE',
      message:
        skipped.length === 0
          ? `No ${need} driver is registered.`
          : `No ${need} driver is available. Tried: ${tried}.`,
      hint: `Every Cogenta need has a driver that works without any external service. If you see this, the degraded ${need} driver is missing or broken — please report it.`,
      details: { need, skipped },
    })
  }

  return {
    register(driver) {
      if (drivers.has(driver.name)) {
        throw new CogentaError({
          code: 'DRIVER_DUPLICATE',
          message: `A ${need} driver named "${driver.name}" is already registered.`,
          hint: 'Driver names are unique per need. Rename one of them.',
          details: { need, driver: driver.name },
        })
      }
      drivers.set(driver.name, driver)
    },

    list: () => ordered(),

    select: async (config) => {
      const name = namedDriver(config)
      return name === undefined ? selectAutomatically(config) : selectNamed(name, config)
    },
  }
}
