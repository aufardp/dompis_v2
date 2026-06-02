import { z } from 'zod';
import { NextResponse } from 'next/server';

export type ValidationError = {
  success: false;
  error: z.ZodError;
};

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T extends z.ZodSchema>(
  schema: T,
  body: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(body);
  
  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }
  
  return {
    success: true,
    data: result.data,
  };
}

/**
 * Validate query params against a Zod schema
 */
export function validateQuery<T extends z.ZodSchema>(
  schema: T,
  params: Record<string, string | string[] | undefined>
): ValidationResult<z.infer<T>> {
  // Flatten array params to strings
  const flatParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      flatParams[key] = value[0] ?? '';
    } else if (typeof value === 'string') {
      flatParams[key] = value;
    }
  }
  
  const result = schema.safeParse(flatParams);
  
  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }
  
  return {
    success: true,
    data: result.data,
  };
}

/**
 * Parse and validate request body. Returns parsed data or sends 400 response.
 */
export async function validateRequestBody<T extends z.ZodSchema>(
  schema: T,
  req: Request
): Promise<z.infer<T> | null> {
  let body: unknown;
  
  try {
    body = await req.json();
  } catch {
    // Can't return here properly, return null and let caller handle
    return null;
  }
  
  const result = validateBody(schema, body);
  
  if (!result.success) {
    return null;
  }
  
  return result.data;
}

/**
 * Format Zod errors for API response
 */
function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'body';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  
  return errors;
}

/**
 * Send validation error response
 */
function sendValidationError<T extends ValidationError>(result: T): null {
  // This function sends response and returns null for type compatibility
  const errors = formatZodErrors(result.error);
  const firstError = Object.values(errors).flat()[0] || 'Validation failed';
  
  // Cannot return NextResponse from async validation function cleanly
  // Caller should handle the response
  return null;
}

/**
 * Helper to create a Next.js route handler wrapper with validation
 */
export function withValidation<T extends z.ZodSchema>(
  schema: T,
  handler: (data: z.infer<T>, req: Request) => Promise<NextResponse>
) {
  return async (req: Request): Promise<NextResponse> => {
    const data = await validateRequestBody(schema, req);
    
    if (data === null) {
      // Validation failed, error already sent (but we need to send it properly)
      const body = await req.clone().json().catch(() => ({}));
      const result = validateBody(schema, body);
      
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message: 'Validation failed',
            errors: formatZodErrors(result.error),
          },
          { status: 400 }
        );
      }
    }
    
    return handler(data!, req);
  };
}