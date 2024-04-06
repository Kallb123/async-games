'use client'

import { Button } from "react-bootstrap";

export default function DevTools() {
    const clearAll = async () => {
        await fetch('/api/dev/clearall');
    }

    return (
        <>
            <h2>Dev Tools</h2>
            <Button onClick={clearAll}>Clear All</Button>
        </>
    );
}
