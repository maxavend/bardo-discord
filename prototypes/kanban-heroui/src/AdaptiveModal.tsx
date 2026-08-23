import { Drawer, Modal } from '@heroui/react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const MOBILE_OVERLAY_QUERY = '(max-width: 47.999rem)';

type Presentation = 'modal' | 'sheet';

const PresentationContext = createContext<Presentation>('modal');

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

function useOverlayPresentation(): Presentation {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_OVERLAY_QUERY).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(MOBILE_OVERLAY_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isMobile ? 'sheet' : 'modal';
}

type RootProps = {
  children: ReactNode;
};

function AdaptiveModalRoot({ children }: RootProps) {
  const presentation = useOverlayPresentation();

  return (
    <PresentationContext.Provider value={presentation}>
      {presentation === 'sheet' ? <Drawer>{children}</Drawer> : <Modal>{children}</Modal>}
    </PresentationContext.Provider>
  );
}

type BackdropProps = {
  children: ReactNode;
  variant?: 'opaque' | 'blur' | 'transparent';
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
};

function AdaptiveBackdrop(props: BackdropProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.Backdrop {...props} />
    : <Modal.Backdrop {...props} />;
}

type ContainerProps = {
  children: ReactNode;
  placement?: 'auto' | 'center' | 'top' | 'bottom';
  scroll?: 'inside' | 'outside';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'cover' | 'full';
  className?: string;
};

function AdaptiveContainer({ children, placement, scroll, size, className }: ContainerProps) {
  const presentation = useContext(PresentationContext);

  if (presentation === 'sheet') {
    return (
      <Drawer.Content placement="bottom" className={joinClassNames('bardo-overlay-sheet-content', className)}>
        {children}
      </Drawer.Content>
    );
  }

  return (
    <Modal.Container
      placement={placement ?? 'center'}
      scroll={scroll ?? 'inside'}
      size={size ?? 'md'}
      className={className}
    >
      {children}
    </Modal.Container>
  );
}

type DialogProps = {
  children: ReactNode;
  className?: string;
  role?: 'dialog' | 'alertdialog';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

function AdaptiveDialog({ children, className, ...props }: DialogProps) {
  const presentation = useContext(PresentationContext);

  if (presentation === 'sheet') {
    return (
      <Drawer.Dialog
        {...props}
        data-bardo-presentation="sheet"
        className={joinClassNames('bardo-overlay-dialog', 'bardo-overlay-sheet', className)}
      >
        <Drawer.Handle />
        {children}
      </Drawer.Dialog>
    );
  }

  return (
    <Modal.Dialog
      {...props}
      data-bardo-presentation="modal"
      className={joinClassNames('bardo-overlay-dialog', 'bardo-overlay-modal', className)}
    >
      {children}
    </Modal.Dialog>
  );
}

type SlotProps = {
  children?: ReactNode;
  className?: string;
};

function AdaptiveCloseTrigger(props: SlotProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.CloseTrigger {...props} />
    : <Modal.CloseTrigger {...props} />;
}

function AdaptiveHeader(props: SlotProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.Header {...props} />
    : <Modal.Header {...props} />;
}

function AdaptiveHeading(props: SlotProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.Heading {...props} />
    : <Modal.Heading {...props} />;
}

function AdaptiveBody(props: SlotProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.Body {...props} />
    : <Modal.Body {...props} />;
}

function AdaptiveFooter(props: SlotProps) {
  const presentation = useContext(PresentationContext);
  return presentation === 'sheet'
    ? <Drawer.Footer {...props} />
    : <Modal.Footer {...props} />;
}

export const AdaptiveModal = Object.assign(AdaptiveModalRoot, {
  Backdrop: AdaptiveBackdrop,
  Container: AdaptiveContainer,
  Dialog: AdaptiveDialog,
  CloseTrigger: AdaptiveCloseTrigger,
  Header: AdaptiveHeader,
  Heading: AdaptiveHeading,
  Body: AdaptiveBody,
  Footer: AdaptiveFooter,
});
