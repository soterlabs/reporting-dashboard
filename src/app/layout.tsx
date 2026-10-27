import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sky · Financial reporting',
  description: 'Pro forma financial reporting for Sky and its prime-agent portfolios.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'light'}catch{}" }} /></head><body>{children}</body></html>;
}
