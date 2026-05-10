"use client";

import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
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
          <ButtonGroup className="w-full sm:w-auto">
            <Button className="min-w-0 flex-1 sm:flex-none" disabled={disabled} onClick={onConfirm} variant="destructive">
              {confirmLabel}
            </Button>
            <Button className="min-w-0 flex-1 sm:flex-none" disabled={disabled} onClick={onCancel} variant="outline">
              {cancelLabel}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
