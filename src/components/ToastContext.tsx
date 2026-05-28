'use client'

import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

interface ToastMessage {
    id: number;
    message: string;
    variant: ToastVariant;
    title: string;
}

interface ToastContextValue {
    showToast: (message: string, variant?: ToastVariant, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const counterRef = useRef(0);
    const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const dismissToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = timeoutRefs.current.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            timeoutRefs.current.delete(id);
        }
    };

    const showToast = (message: string, variant: ToastVariant = 'info', title?: string) => {
        const id = ++counterRef.current;
        const defaultTitles: Record<ToastVariant, string> = {
            success: 'Success',
            danger: 'Error',
            warning: 'Warning',
            info: 'Info',
        };
        setToasts(prev => [...prev, { id, message, variant, title: title ?? defaultTitles[variant] }]);
        const timer = setTimeout(() => dismissToast(id), 5000);
        timeoutRefs.current.set(id, timer);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1100 }}>
                {toasts.map(toast => (
                    <Toast
                        key={toast.id}
                        bg={toast.variant}
                        onClose={() => dismissToast(toast.id)}
                        show
                    >
                        <Toast.Header>
                            <strong className="me-auto">{toast.title}</strong>
                        </Toast.Header>
                        <Toast.Body className={toast.variant === 'danger' || toast.variant === 'success' ? 'text-white' : ''}>
                            {toast.message}
                        </Toast.Body>
                    </Toast>
                ))}
            </ToastContainer>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
