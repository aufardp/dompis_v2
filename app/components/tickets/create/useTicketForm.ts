import { useState } from 'react';
import { TicketFormData } from './types';

export function useTicketForm(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const initialState: TicketFormData = {
    contactName: '',
    contactPhone: '',
    serviceNo: '',
    serviceType: '',
    customerType: '',
    summary: '',
    symptom: '',
    priority: '',
    ownerGroup: 'Network Operations',
    deviceName: '',
    areaId: '',
  };

  const [formData, setFormData] = useState(initialState);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const submit = async () => {
    setLoading(true);
    setErrors([]);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          areaId: formData.areaId ? Number(formData.areaId) : null,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.errors?.join(', ') || data.message);
      }

      setFormData(initialState);
      onSuccess?.();
    } catch (err: any) {
      setErrors([err.message]);
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    loading,
    errors,
    handleChange,
    submit,
  };
}
