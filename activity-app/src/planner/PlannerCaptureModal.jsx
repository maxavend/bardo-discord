import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { PlannerMemberPicker } from './PlannerMemberPicker.jsx';

export function PlannerCaptureModal({
  isOpen,
  onClose,
  onSubmit,
  initialBlockId = null,
  blocks = [],
}) {
  const [content, setContent] = useState('');
  const [owner, setOwner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setOwner('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const targetBlock = blocks.find((b) => b.id === initialBlockId) || blocks[0];

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const cleanOwner = typeof owner === 'string' && owner.trim() ? owner.trim().replace(/^@/, '') : null;
      onSubmit({
        kind: 'decision',
        blockId: targetBlock?.id || initialBlockId,
        content: content.trim(),
        owner: cleanOwner || null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-4xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">Agregar decisión</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe la decisión o acuerdo alcanzado en este bloque..."
            autoFocus
            rows={4}
            required
            className="resize-none rounded-2xl"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Responsable (opcional)
            </label>
            <PlannerMemberPicker
              value={owner}
              onChange={setOwner}
              singleSelect
              hideRoles
              placeholder="Seleccionar responsable (opcional)..."
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full px-5 h-9"
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="rounded-full px-5 h-9"
            >
              {isSubmitting ? 'Guardando...' : 'Aceptar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
