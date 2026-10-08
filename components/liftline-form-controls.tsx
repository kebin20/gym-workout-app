import type { ComponentProps } from 'react';

import { Input as BaseInput } from '@/components/ui/input';
import { Textarea as BaseTextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// The shared primitives shrink to 14px at md, which can trigger iOS focus
// zoom in landscape or with a desktop-width viewport. Keep Liftline's editable
// text at 16px without restricting the user's viewport/pinch zoom.
const editableText = 'text-base md:text-base';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <BaseInput {...props} className={cn(editableText, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <BaseTextarea {...props} className={cn(editableText, className)} />;
}
