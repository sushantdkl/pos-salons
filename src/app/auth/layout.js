// Not a public website page: kept out of search results (also sent as an X-Robots-Tag header).
export const metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }) {
  return children;
}
