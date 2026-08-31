"use client";

import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { AppDialogContent } from "@/components/ui/AppDialog";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/shadcn/dialog";

type DeleteConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel: string;
  description?: string;
  disabled?: boolean;
  message: string;
  onCancel?: () => void;
  onConfirm: () => void;
  open?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title?: string;
  trigger?: ReactNode;
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
  returnFocusRef,
  title = "Confirm Delete",
  trigger
}: DeleteConfirmDialogProps) {
  const cancelButton = (
    <Button
      className="min-w-0 flex-1 sm:flex-none"
      disabled={disabled}
      onClick={trigger ? undefined : onCancel}
      variant="outline"
    >
      {cancelLabel}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !disabled) {
          onCancel?.();
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <AppDialogContent
        className="border-loss-border p-4"
        onCloseAutoFocus={returnFocusRef ? (event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        } : undefined}
        showCloseButton={!disabled}
      >
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
            {trigger ? <DialogClose asChild>{cancelButton}</DialogClose> : cancelButton}
          </ButtonGroup>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
