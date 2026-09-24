import { formatTicks } from "../tick";
import { KINGDOM_BUILDER_UNITS, type KingdomBuilderTrainingOrder } from "../units";

/**
 * The settlement's one training queue, head first, as a row of chips — each
 * with its own ✕ that takes that unit back out for a full refund. The head is
 * the unit in training, drawn dark and carrying the time it has left.
 */
export default function TrainingQueue({ queue, pending, disabled, onCancel, className }: {
    queue: readonly KingdomBuilderTrainingOrder[];
    /** The key of the command in flight, if any. */
    pending: string | null;
    disabled: boolean;
    onCancel: (key: string, request: object) => void;
    /** Spacing from the screen around it. */
    className?: string;
}) {
    if (queue.length === 0) return null;
    return (
        <div className={`ag-chips${className ? ` ${className}` : ""}`} role="list" aria-label="Training queue">
            {queue.map((order, index) => {
                const unit = KINGDOM_BUILDER_UNITS[order.unitType];
                const key = `cancel-${order.orderId}`;
                const training = index === 0;
                return (
                    <span
                        role="listitem"
                        key={order.orderId ?? index}
                        className={`ag-person-chip${training ? " ag-person-chip--you" : ""}${pending === key ? " ag-pending-skin" : ""}`}
                    >
                        <span aria-hidden>{unit.icon}</span>
                        {training ? `${unit.name} · ${formatTicks(order.ticksRemaining)}` : unit.name}
                        {/* An order queued before cancelling existed has no id to cancel it by. */}
                        {order.orderId && (
                            <button
                                type="button"
                                aria-label={`Cancel ${unit.name.toLowerCase()}${training ? " in training" : ""} and refund it`}
                                disabled={disabled}
                                onClick={() => onCancel(key, { action: "cancel-training", orderId: order.orderId })}
                            >✕</button>
                        )}
                    </span>
                );
            })}
        </div>
    );
}
