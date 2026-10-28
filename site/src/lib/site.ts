import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const INSTALL_URL = 'https://discord.com/oauth2/authorize?client_id=1539704001535156254';

export const container = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-16';
export const h2 = 'max-w-[18ch] text-[clamp(2rem,2.5vw+1rem,3.5rem)] leading-[1.05]';
export const lead = 'max-w-[44ch] text-[clamp(1.125rem,0.35vw+1rem,1.375rem)] leading-[1.45] text-secondary-foreground';
export const primaryCta = cn(buttonVariants({ size: 'lg' }), 'h-12 rounded-full px-6 text-base font-semibold active:translate-y-px');
export const quietCta = cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 rounded-full border-rule-strong bg-transparent px-6 text-base font-semibold hover:border-foreground hover:bg-paper-2 active:translate-y-px');
export const navCta = cn(buttonVariants({ variant: 'outline' }), 'h-11 rounded-full border-rule-strong bg-transparent px-4 font-semibold hover:border-foreground active:translate-y-px');
