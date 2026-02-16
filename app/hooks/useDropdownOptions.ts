import { useState, useEffect } from 'react';

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
        const res = await fetch('/api/area');
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
        const res = await fetch('/api/sa');
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
        const res = await fetch('/api/sa');
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
        const res = await fetch('/api/sa');
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

export function useWorkzoneOptions(): UseDropdownOptionsReturn {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/workzone');
        const data = await res.json();
        if (data.success) {
          setOptions(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to fetch workzone options');
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  return { options, loading, error };
}
