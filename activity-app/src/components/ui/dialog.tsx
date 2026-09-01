"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-100 outline-none sm:max-w-md dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 right-4 bg-secondary"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

// Modal backward-compatibility compound helper
const Modal = ({ isOpen = true, onOpenChange, children }: any) => {
  if (isOpen === false) return null
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>{children}</Dialog>
}
Modal.Backdrop = ({ isOpen = true, onOpenChange, children }: any) => {
  if (isOpen === false) return null
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>{children}</Dialog>
}
Modal.Container = ({ children }: any) => <>{children}</>
Modal.Dialog = ({ children, className }: any) => (
  <DialogContent className={className}>{children}</DialogContent>
)
Modal.Header = DialogHeader
Modal.Heading = DialogTitle
Modal.Body = ({ children, className }: any) => (
  <div className={cn("py-2 flex flex-col gap-2", className)}>{children}</div>
)
Modal.Footer = DialogFooter
Modal.CloseTrigger = DialogClose

const ModalContent = ({ children, className }: any) => (
  <DialogContent className={className}>{children}</DialogContent>
)
const ModalHeader = DialogHeader
const ModalBody = ({ children, className }: any) => (
  <div className={cn("py-2 flex flex-col gap-2", className)}>{children}</div>
)
const ModalFooter = DialogFooter

// AlertDialog compound helper
const AlertDialog = ({ isOpen = true, onOpenChange, children }: any) => {
  if (isOpen === false) return null
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>{children}</Dialog>
}
AlertDialog.Backdrop = ({ isOpen = true, onOpenChange, children }: any) => {
  if (isOpen === false) return null
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>{children}</Dialog>
}
AlertDialog.Container = ({ children }: any) => <>{children}</>
AlertDialog.Dialog = ({ children, className }: any) => (
  <DialogContent className={className}>{children}</DialogContent>
)
AlertDialog.CloseTrigger = DialogClose
AlertDialog.Header = DialogHeader
AlertDialog.Icon = () => null
AlertDialog.Heading = DialogTitle
AlertDialog.Body = DialogDescription
AlertDialog.Footer = DialogFooter

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  AlertDialog,
}
