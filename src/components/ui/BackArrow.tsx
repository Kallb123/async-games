// The back arrow itself, drawn rather than typed.
//
// A "←" character is centred by the font's metrics, not by its ink, so it
// always sat low and left of the middle of the round button around it. The
// same path on a square viewBox is centred by geometry, in every button that
// shows a back arrow.
export default function BackArrow() {
    return (
        <svg
            viewBox="0 0 20 20"
            width="1.1em"
            height="1.1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M16 10H4.6" />
            <path d="M9.5 4.8 4.3 10l5.2 5.2" />
        </svg>
    );
}
