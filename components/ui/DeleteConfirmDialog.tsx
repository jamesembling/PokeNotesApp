"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/shadcn/dialog";

type DeleteConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel: string;
  description?: string;
  disabled?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title?: string;
};

export function DeleteConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  disabled = false,
  message,
  onCancel,
  onConfirm,
  open,
  title = "Confirm Delete"
}: DeleteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !disabled) {
          onCancel();
        }
      }}
    >
      <DialogContent className="border border-[var(--color-loss-border)]" showCloseButton={!disabled}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
          {description ? (
            <p className="text-sm text-foreground">{description}</p>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full sm:w-auto" disabled={disabled} onClick={onConfirm} variant="danger">
            {confirmLabel}
          </Button>
          <Button className="w-full sm:w-auto" disabled={disabled} onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
