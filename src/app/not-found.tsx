import ErrorScreen from '@/components/ui/ErrorScreen';

/**
 * A URL that matches no route — a mistyped link, or one to a game or lobby
 * that has since been cleaned up. Same shell as the error boundary so a dead
 * end always looks like the app rather than like the app falling over.
 */
export default function NotFound() {
    return (
        <ErrorScreen
            title="There's nothing here"
            message="That link doesn't go anywhere any more. It may have been a game or a lobby that has since finished."
        />
    );
}
