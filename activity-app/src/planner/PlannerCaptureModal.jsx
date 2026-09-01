import {useState, useEffect} from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
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
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Agregar decisión</h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {targetBlock?.title && (
                  <p className="text-xs text-muted-foreground font-normal">
                    Bloque: <span className="font-medium text-foreground">«{targetBlock.title}»</span>
                  </p>
                )}
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Escribe la decisión o acuerdo alcanzado en este bloque..."
                  autoFocus
                  rows={4}
                  required
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
                    Cancelar
                  </Button>
                  <Button variant="default" size="sm" type="submit" disabled={!content.trim() || isSubmitting}>
                    {isSubmitting ? 'Guardando...' : 'Guardar decisión'}
                  </Button>
                </div>
              </form>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
