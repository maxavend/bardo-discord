import { useRef, useEffect, useCallback } from 'react';
import { useEditorRef } from 'platejs/react';
import { Grip } from '@gravity-ui/icons';

export function BardoBlockDragHandle({ shellRef, bodyRef }) {
  const editor = useEditorRef();
  const handleRef = useRef(null);
  const dropLineRef = useRef(null);
  const activeHoveredBlockRef = useRef(null);
  const draggedBlockRef = useRef(null);
  const dropTargetRef = useRef(null);

  const getDirectBlock = useCallback((target) => {
    if (!bodyRef.current || !target || target === bodyRef.current) return null;
    let el = target;
    while (el && el.parentElement && el.parentElement !== bodyRef.current) {
      el = el.parentElement;
    }
    return el && el.parentElement === bodyRef.current ? el : null;
  }, [bodyRef]);

  const handleDragStart = useCallback((e) => {
    const block = activeHoveredBlockRef.current;
    if (!block) return;
    draggedBlockRef.current = block;
    block.classList.add('is-dragging-block');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.innerText || '');
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedBlockRef.current) {
      draggedBlockRef.current.classList.remove('is-dragging-block');
    }
    draggedBlockRef.current = null;
    dropTargetRef.current = null;
    if (dropLineRef.current) {
      dropLineRef.current.style.display = 'none';
    }
  }, []);

  const handleEditorDragOver = useCallback((e) => {
    if (!draggedBlockRef.current || !shellRef.current || !dropLineRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const block = getDirectBlock(e.target);
    if (!block) {
      dropLineRef.current.style.display = 'none';
      dropTargetRef.current = null;
      return;
    }
    const blockRect = block.getBoundingClientRect();
    const shellRect = shellRef.current.getBoundingClientRect();
    const isAfter = e.clientY > (blockRect.top + blockRect.height / 2);
    const lineY = (isAfter ? blockRect.bottom : blockRect.top) - shellRect.top;
    dropLineRef.current.style.transform = `translate3d(0, ${lineY}px, 0) translateY(-50%)`;
    dropLineRef.current.style.display = 'block';
    dropTargetRef.current = { block, isAfter };
  }, [getDirectBlock, shellRef]);

  const handleEditorDrop = useCallback((e) => {
    e.preventDefault();
    const dragged = draggedBlockRef.current;
    const targetInfo = dropTargetRef.current;

    if (dragged && targetInfo?.block && dragged !== targetInfo.block && bodyRef.current && editor) {
      const children = Array.from(bodyRef.current.children);
      const fromIndex = children.indexOf(dragged);
      let toIndex = children.indexOf(targetInfo.block);

      if (fromIndex >= 0 && toIndex >= 0) {
        if (targetInfo.isAfter) {
          toIndex += 1;
        }
        if (fromIndex < toIndex) {
          toIndex -= 1;
        }

        try {
          editor.tf.moveNodes({
            at: [fromIndex],
            to: [toIndex],
          });
        } catch {
          // Fallback seguro
        }
      }
    }

    if (dragged) {
      dragged.classList.remove('is-dragging-block');
    }
    draggedBlockRef.current = null;
    dropTargetRef.current = null;
    if (dropLineRef.current) {
      dropLineRef.current.style.display = 'none';
    }
    if (handleRef.current) {
      handleRef.current.style.opacity = '0';
      handleRef.current.style.pointerEvents = 'none';
    }
  }, [bodyRef, editor]);

  // Listener para el hover en el gutter izquierdo
  useEffect(() => {
    const onMove = (e) => {
      if (draggedBlockRef.current || !handleRef.current || !shellRef.current || !bodyRef.current) return;
      if (handleRef.current.contains(e.target)) return;

      const bodyRect = bodyRef.current.getBoundingClientRect();
      const gutterLeft = bodyRect.left - 60;
      const inGutter = e.clientX >= gutterLeft && e.clientX < bodyRect.right &&
                       e.clientY >= bodyRect.top && e.clientY <= bodyRect.bottom;

      if (!inGutter) {
        handleRef.current.style.opacity = '0';
        handleRef.current.style.pointerEvents = 'none';
        activeHoveredBlockRef.current = null;
        return;
      }

      const block = getDirectBlock(document.elementFromPoint(bodyRect.left + 4, e.clientY));
      if (!block) return;
      activeHoveredBlockRef.current = block;
      const blockRect = block.getBoundingClientRect();
      const shellRect = shellRef.current.getBoundingClientRect();
      const top = blockRect.top - shellRect.top;
      const offset = block.tagName === 'H1' ? 8 : block.tagName === 'H2' ? 6 : 2;
      handleRef.current.style.top = `${Math.max(0, top + offset)}px`;
      handleRef.current.style.opacity = '1';
      handleRef.current.style.pointerEvents = 'auto';
    };

    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [bodyRef, getDirectBlock, shellRef]);

  // Asignar listeners de dragover/drop al shell
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    shell.addEventListener('dragover', handleEditorDragOver);
    shell.addEventListener('drop', handleEditorDrop);

    return () => {
      shell.removeEventListener('dragover', handleEditorDragOver);
      shell.removeEventListener('drop', handleEditorDrop);
    };
  }, [handleEditorDragOver, handleEditorDrop, shellRef]);

  return (
    <>
      <div
        ref={handleRef}
        role="button"
        tabIndex={-1}
        className="block-drag-handle"
        style={{ opacity: 0, pointerEvents: 'none' }}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onPointerDown={e => e.stopPropagation()}
        aria-label="Arrastrar bloque"
        title="Arrastra para reordenar el bloque"
      >
        <Grip width={14} height={14} />
      </div>
      <div
        ref={dropLineRef}
        className="block-drop-line"
        style={{ display: 'none', transform: 'translate3d(0, 0, 0)' }}
      />
    </>
  );
}
