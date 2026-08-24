import "./globals.css";

export const metadata = {
  title: "AI Study Assistant",
  description: "AI powered study assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}