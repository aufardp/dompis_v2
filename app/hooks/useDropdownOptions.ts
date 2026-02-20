import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Option {
  value: string;
  label: string;
}

interface UseDropdownOptionsReturn {
  options: Option[];
  loading: boolean;
  error: string | null;
}

export function useAreaOptions(): UseDropdownOptionsReturn {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth('/api/area');
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          setOptions(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch area options');
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return { options, loading, error };
}

export function useServiceAreaOptions(): UseDropdownOptionsReturn {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth('/api/sa');
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          setOptions(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch service area options');
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return { options, loading, error };
}

export function useRcaOptions(): UseDropdownOptionsReturn {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth('/api/sa');
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          setOptions(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch rca options');
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return { options, loading, error };
}

export function useSubRcaOptions(): UseDropdownOptionsReturn {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth('/api/sa');
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          setOptions(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to sub rca options');
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return { options, loading, error };
}

export function useWorkzoneOptions() {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkzones = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth('/api/workzone');
        if (!res) {
          setError('Failed to fetch');
          return;
        }
        const result = await res.json();

        if (result.success) {
          setOptions(result.data || []);
        } else {
          setError(result.message || 'Failed to fetch workzones');
        }
      } catch (err) {
        setError('Failed to fetch workzones');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkzones();
  }, []);

  return { options, loading, error };
}
