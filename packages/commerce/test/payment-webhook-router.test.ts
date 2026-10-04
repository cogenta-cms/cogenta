import { testDb } from './helpers/db.js'
import { runPaymentWebhookContract } from './payment-webhook.contract.js'

runPaymentWebhookContract('sqlite', testDb)
