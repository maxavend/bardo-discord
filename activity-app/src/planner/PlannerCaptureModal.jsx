import {useState, useEffect} from 'react';
import {
  Button,
  Modal,
  TextField,
  Label,
  TextArea,
  Select,
  ListBox,
} from '@heroui/react';
import {CircleCheck} from '@gravity-ui/icons';

export function PlannerCaptureModal({
  isOpen,
  onClose,
  onSubmit,
  initialBlockId = null,
  blocks = [],
  lockContext = false,
  contextLabel = '',
}) {
  const [content, setContent] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState(() => initialBlockId || blocks[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setSelectedBlockId(initialBlockId || blocks[0]?.id || '');
      setIsSubmitting(false);
    }
  }, [isOpen, initialBlockId, blocks]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      onSubmit({
        kind: 'decision',
        blockId: selectedBlockId || blocks[0]?.id,
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
          <Modal.Dialog className="max-w-md w-full">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="text-base font-semibold text-foreground flex items-center gap-2">
                <CircleCheck width={16} height={16} className="text-accent" />
                ¿Qué quieres guardar?
              </Modal.Heading>
            </Modal.Header>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Modal.Body className="flex flex-col gap-3.5">
                {lockContext ? (
                  contextLabel && (
                    <div className="text-xs text-muted">
                      Contexto: <span className="text-foreground font-medium">{contextLabel}</span>
                    </div>
                  )
                ) : blocks.length > 0 ? (
                  <Select
                    fullWidth
                    selectedKey={selectedBlockId || blocks[0]?.id}
                    onSelectionChange={(key) => setSelectedBlockId(String(key))}
                    variant="secondary"
                  >
                    <Label className="text-xs font-medium text-muted">Bloque asociado</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {blocks.map((block, index) => (
                          <ListBox.Item key={block.id} id={block.id} textValue={`Bloque 0${index + 1}: ${block.title}`}>
                            Bloque 0{index + 1}: {block.title}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                ) : null}

                <TextField isRequired className="w-full">
                  <TextArea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Escribe algo importante…"
                    autoFocus
                    rows={3}
                  />
                </TextField>
              </Modal.Body>

              <Modal.Footer className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onPress={onClose} isDisabled={isSubmitting}>Cancelar</Button>
                <Button type="submit" variant="primary" size="sm" isDisabled={!content.trim() || isSubmitting}>
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
