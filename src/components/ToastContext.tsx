'use client'

import { createContext, useContext, useState, ReactNode } from 'react';
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

    const showToast = (message: string, variant: ToastVariant = 'info', title?: string) => {
        const id = Date.now();
        const defaultTitles: Record<ToastVariant, string> = {
            success: 'Success',
            danger: 'Error',
            warning: 'Warning',
            info: 'Info',
        };
        setToasts(prev => [...prev, { id, message, variant, title: title ?? defaultTitles[variant] }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1100 }}>
                {toasts.map(toast => (
                    <Toast
                        key={toast.id}
                        bg={toast.variant}
                        onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
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
