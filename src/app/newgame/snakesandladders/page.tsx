'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import UserInviteList from "@/components/UserInviteList";
import { SnakesAndLaddersInvitationRequest } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";

export default function NewGameSnakesAndLadders() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const [userList, setUserList] = useState([""] as string[]);
  const [turnTimer, setTurnTimer] = useState("1d");
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        router.push('/login');
      }

      const unlocked = user?.publicMetadata.unlocked;

      if (unlocked !== true) {
        router.push('/unlockaccess');
      }
    }
  }, [isLoaded]);

  const setUserListItem = (index: number, value: string) => {
    const changedList = userList.map((user, i) => {
      if (i === index) {
        return value;
      } else {
        return user;
      }
    });
    const filteredList = changedList.filter((user) => {
      if (user !== "") return user;
      return null;
    });
    if (filteredList.length === 0) {
      setUserList([""]);
    } else {
      if (filteredList[filteredList.length - 1] === "") {
        setUserList(filteredList);
      } else {
        setUserList([...filteredList, ""]);
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const filteredUserList = userList.filter((user) => {
      if (user !== "") return user;
      return null;
    });

    try {
      const data: SnakesAndLaddersInvitationRequest = {
        userList: filteredUserList,
        turnTimer
      };
      await fetch('/api/newgame/snakesandladders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <main>
      <h1>New Game: Snakes and Ladders</h1>
      <h2><a href="/">Home</a></h2>
      <Form onSubmit={handleSubmit}>
        <Row>
          <Col>
            <UserInviteList userList={userList} setItem={setUserListItem} />
          </Col>
          <Col>
            <h3>Options</h3>
            <Form.Group as={Row} className="mb-3">
              <Form.Label column>Turn Time Limit</Form.Label>
              <Col sm={8}>
                <Form.Select as={Col} value={turnTimer} onChange={(e) => setTurnTimer(e.target.value)} aria-label="Turn timer select">
                  <option value="10m">10 minutes</option>
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="3h">3 hours</option>
                  <option value="6h">6 hours</option>
                  <option value="12h">12 hours</option>
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
