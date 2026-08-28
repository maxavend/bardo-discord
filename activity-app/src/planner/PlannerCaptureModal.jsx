import {useState, useEffect} from 'react';
import {
  Button,
  Modal,
  TextField,
  TextArea,
} from '@heroui/react';
import {CircleCheck} from '@gravity-ui/icons';

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
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full p-5 rounded-2xl bg-surface border border-border shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="pb-1">
              <Modal.Heading className="text-base font-semibold text-foreground flex items-center gap-2">
                <CircleCheck width={16} height={16} className="text-accent" />
                ¿Qué quieres guardar?
              </Modal.Heading>
              {targetBlock?.title && (
                <p className="text-xs text-muted mt-1 font-normal">
                  Se agregará al bloque <span className="font-semibold text-foreground">“{targetBlock.title}”</span>
                </p>
              )}
            </Modal.Header>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              <Modal.Body className="flex flex-col gap-3.5 p-0">
                <TextField isRequired className="w-full">
                  <TextArea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Escribe el acuerdo o decisión importante…"
                    autoFocus
                    rows={4}
                    className="w-full rounded-xl border border-border/80 bg-surface-secondary/50 text-foreground placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:bg-surface text-sm p-3 transition-colors outline-none resize-none"
                  />
                </TextField>
              </Modal.Body>

              <Modal.Footer className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onPress={onClose} isDisabled={isSubmitting} className="h-8 px-3 text-xs">
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" isDisabled={!content.trim() || isSubmitting} className="h-8 px-4 text-xs font-medium">
                  {isSubmitting ? 'Guardando…' : 'Guardar'}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
