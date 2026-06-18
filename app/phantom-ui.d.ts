import type { PhantomUiAttributes } from '@aejkatappaja/phantom-ui';

declare module '@aejkatappaja/phantom-ui' {
  interface PhantomUiAttributes {
    suppressHydrationWarning?: boolean;
  }
}

declare module 'react/jsx-runtime' {
  export namespace JSX {
    interface IntrinsicElements {
      'phantom-ui': PhantomUiAttributes;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'phantom-ui': PhantomUiAttributes;
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'phantom-ui': PhantomUiAttributes;
    }
  }
}

export {};
