/**
 * The admin's design system — L11 task 1.
 *
 * shadcn/ui on Tailwind, with the components copied into the repository rather
 * than installed (the decision recorded in `docs/lots/L10-cms-complet.md`, L11
 * "Périmètre"). Six components, which is the scope that lot fixes on purpose
 * — button, field, table, card, modal, notification — and the rule that came
 * with it: no seventh without a real second use, since the project's standing
 * rule is no abstraction before three real uses.
 *
 * The palette they render with is `../styles/theme.css`.
 */

export type { ButtonProps } from './button.js'
export { Button, buttonVariants } from './button.js'
export {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card.js'
export { cn } from './cn.js'
export type { FieldControlProps, FieldProps } from './field.js'
export { Field, Input, Label, Select } from './field.js'
export type { ModalProps } from './modal.js'
export { Modal } from './modal.js'
export type { NoticeProps } from './notice.js'
export { Notice } from './notice.js'
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
