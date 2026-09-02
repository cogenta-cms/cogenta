/**
 * The admin's design system — L11 task 1.
 *
 * shadcn/ui on Tailwind, with the components copied into the repository rather
 * than installed (the decision recorded in `docs/lots/L10-cms-complet.md`, L11
 * "Périmètre"). Six components fixed L11's own scope on purpose — button,
 * field, table, card, modal, notification — behind the rule that came with
 * it: no seventh without a real second use, since the project's standing
 * rule is no abstraction before three real uses.
 *
 * `Pagination` (fiche 67 task 1) is the seventh, and clears that bar before
 * it exists: two genuinely different ad hoc patterns already duplicated
 * across screens (`users.tsx`'s cursor "load more", `redirects.tsx`'s
 * numbered pager, both copied by hand elsewhere), and the fiche that adds it
 * names five screens meant to consume it.
 *
 * The palette they render with is `../styles/theme.css`.
 */

export type { BadgeProps } from './badge.js'
export { Badge } from './badge.js'
export type { ButtonProps } from './button.js'
export { Button, buttonVariants } from './button.js'
export type { CardProps } from './card.js'
export {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
} from './card.js'
export { cn } from './cn.js'
export type { FieldControlProps, FieldProps } from './field.js'
export { Field, Input, Label, Select } from './field.js'
export type { ModalProps } from './modal.js'
export { Modal } from './modal.js'
export type { NoticeProps } from './notice.js'
export { Notice } from './notice.js'
export type { PageHeaderProps } from './page-header.js'
export { PageHeader } from './page-header.js'
export type { CursorPaginationProps, PagesPaginationProps, PaginationProps } from './pagination.js'
export { Pagination } from './pagination.js'
export type { StatProps } from './stat.js'
export { Stat } from './stat.js'
export type { TableRootProps } from './table.js'
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from './table.js'
