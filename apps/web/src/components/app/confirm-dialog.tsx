import { t } from "@/i18n";
import * as React from "react";
import { Button, Dialog, DialogActions, DialogContent } from "@/components/ui";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

/** Confirmação curta: título, explicação honesta do efeito e duas ações. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = t("Confirmar"),
  cancelLabel = t("Cancelar"),
  danger,
  loading,
  onConfirm,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {children}
        <DialogActions>
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="lg"
            loading={loading}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
