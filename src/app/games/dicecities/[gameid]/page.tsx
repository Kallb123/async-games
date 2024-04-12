'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";

export default function GameDiceCities({ params }: { params: { gameid: string } }) {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const [userList, setUserList] = useState([""] as string[]);
  const [enabledDocks, setEnabledDocks] = useState(false);
  const [enabledBillionaireRow, setEnabledBillionaireRow] = useState(false);
  const [turnTimer, setTurnTimer] = useState("1d");
  const router = useRouter();

  const gameId = params.gameid;

  useEffect(() => {
    if (isLoaded) {
        if (!user) {
            router.push('/login');
        }

        // Use `user` to render user details or create UI elements
        const unlocked = user?.publicMetadata.unlocked;
      
        if (unlocked !== true) {
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded]);

  const handleTakeTurn = async () => {
    fetch('/api/game/taketurn', {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({gameId})
    })
    .then(response => response.json())
    .then(data => console.log(data));
}

  return (
    <main>
      <h1>Dice Cities</h1>
        <Form>
            <Row>
                <Col>
                    <Button onClick={handleTakeTurn}>Take Turn</Button>
                </Col>
            </Row>
          <Row>
            <Col>
              <h3>Expansions</h3>
              <Form.Check
                type="switch"
                label="Docks"
                checked={enabledDocks}
                onChange={(e) => setEnabledDocks(e.target.checked)}
              /><br />
              <Form.Check
                type="switch"
                label="Billionaire's Row"
                checked={enabledBillionaireRow}
                onChange={(e) => setEnabledBillionaireRow(e.target.checked)}
              />
              <h3>Options</h3>
              <Form.Group as={Row} className="mb-3">
                <Form.Label column>Turn Time Limit</Form.Label>
                <Col sm={8}>
                  <Form.Select as={Col} value={turnTimer} onChange={(e) => setTurnTimer(e.target.value)} aria-label="Turn timer select">
                    <option value="10m">10 minutes</option>
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="3h">3 hours</option>
                    <option value="1d">1 day</option>
                    <option value="3d">3 days</option>
                    <option value="7d">7 days</option>
                  </Form.Select>
                </Col>
              </Form.Group>
            </Col>
            <Button type="submit">Send Invitation</Button>
          </Row>
        </Form>
        <CurrentUserInfo />
        <FcmTokenComp />
    </main>
  );
}
