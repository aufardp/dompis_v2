'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import UserMenuButton from './UserMenuButton';
import UserMenuDropdown from './UserMenuDropdown';
import LogoutConfirmModal from '../LogoutConfirmModal';

interface Props {
  profileHref?: string;
}

export default function UserMenu({ profileHref }: Props) {
  const { user } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const initials = useMemo(() => {
    const nama = user?.nama?.trim();
    if (!nama) return '?';
    return nama
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [user?.nama]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const resolvedProfileHref =
    profileHref ||
    (pathname?.startsWith('/teknisi') ? '/teknisi/profile' : '/admin/profile');

  const handleProfile = () => {
    setIsOpen(false);
    router.push(resolvedProfileHref);
  };

  const handleLogout = async () => {
    setIsOpen(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        setShowLogoutModal(false);
        router.push('/login');
        router.refresh();
      }
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className='relative' ref={ref}>
      <UserMenuButton
        name={user?.nama}
        initials={initials}
        onClick={() => setIsOpen((v) => !v)}
      />

      {isOpen && (
        <UserMenuDropdown onProfile={handleProfile} onLogout={handleLogout} />
      )}

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        title='Logout now?'
        description='You will need to sign in again to access the dashboard.'
        hint='Press Esc to cancel'
        confirmLabel={loggingOut ? 'Logging out…' : 'Yes, logout'}
        cancelLabel='Stay logged in'
        loading={loggingOut}
        onClose={() => {
          if (!loggingOut) setShowLogoutModal(false);
        }}
        onConfirm={confirmLogout}
      />
    </div>
  );
}
