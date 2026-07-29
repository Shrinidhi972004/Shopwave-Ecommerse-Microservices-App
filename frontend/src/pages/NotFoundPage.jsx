import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold tracking-tight text-ink-200">404</p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-ink-500">
        That page doesn't exist, or it moved somewhere else.
      </p>
      <Link to="/" className="btn-primary mt-8">
        Back to shop
      </Link>
    </div>
  );
}
