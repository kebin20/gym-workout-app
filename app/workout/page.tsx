import { env } from 'cloudflare:workers';
import { LockKeyhole } from 'lucide-react';
import Link from 'next/link';

import { chatGPTSignOutPath, requireChatGPTUser } from '@/app/chatgpt-auth';
import { WorkoutApp } from '@/app/workout-app';

export const dynamic = 'force-dynamic';

export default async function PrivateWorkoutPage() {
  const user = await requireChatGPTUser('/workout');
  const ownerUserId = env.LIFTLINE_OWNER_USER_ID;

  if (!ownerUserId || user.userId !== ownerUserId) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 font-sans text-foreground">
        <section className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl shadow-slate-900/5">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary"><LockKeyhole className="size-6" /></span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Private workout space</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The public preview is available to everyone, but workout history and editing are restricted to the owner.</p>
          <div className="mt-6 grid gap-3">
            <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">View public preview</Link>
            <a href={chatGPTSignOutPath('/')} target="_top" className="inline-flex h-11 items-center justify-center rounded-xl border px-5 font-semibold">Sign out</a>
          </div>
        </section>
      </main>
    );
  }

  return <WorkoutApp mode="owner" userLabel={user.fullName ?? user.email} signOutHref={chatGPTSignOutPath('/')} />;
}
