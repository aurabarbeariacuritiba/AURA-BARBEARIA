import type { ApptStatus, PayStatus } from "../lib/types";
import { PAY_STATUS_LABEL, STATUS_LABEL } from "../lib/format";
import { Badge, type BadgeColor } from "./ui";

const S: Record<ApptStatus, BadgeColor> = { pending: "yellow", confirmed: "blue", completed: "green", cancelled: "red", no_show: "gray" };
const P: Record<PayStatus, BadgeColor> = { unpaid: "gray", pending: "yellow", paid: "green", failed: "red", refunded: "gray" };

export const StatusBadge = ({ s }: { s: ApptStatus }) => <Badge color={S[s]}>{STATUS_LABEL[s]}</Badge>;
export const PayBadge = ({ s }: { s: PayStatus }) => <Badge color={P[s]}>{PAY_STATUS_LABEL[s]}</Badge>;
