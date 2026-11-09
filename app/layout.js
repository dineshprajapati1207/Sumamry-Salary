import './globals.css';

export const metadata = {
  title: 'Salary Summary Dashboard',
  description: 'Monthly salary reports: Field Sales, MIS Entry, Reclassification and Tally Entry.',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
