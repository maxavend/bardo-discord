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

export function PlannerCaptureModal({
  isOpen,
  onClose,
  onSubmit,
  initialBlockId = null,
  blocks = [],
}) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const targetBlock = blocks.find((b) => b.id === initialBlockId) || blocks[0];

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      onSubmit({
        kind: 'decision',
        blockId: targetBlock?.id || initialBlockId,
        content: content.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar decisión</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe la decisión o acuerdo alcanzado en este bloque..."
            autoFocus
            rows={4}
            required
            className="resize-none"
          />
          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              type="submit"
              disabled={!content.trim() || isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Aceptar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
