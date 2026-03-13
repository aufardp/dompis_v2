'use client';
import { useState, useCallback } from 'react';
import { ToastItem, ToastType } from '../ToastNotification';

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showSuccess = useCallback((title: string, message?: string) => addToast('success', title, message), [addToast]);
  const showError = useCallback((title: string, message?: string) => addToast('error', title, message), [addToast]);

  return { toasts, dismissToast, showSuccess, showError };
}
