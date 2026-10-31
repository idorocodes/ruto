import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCampusRouteRequest,
  generateRouteDirectionsWithGemma,
  getInbox,
  getSessionData,
  normalizeApiError,
  resetMockDemoStorage,
  saveActiveHandle,
  toggleSimulateTampering,
  triggerDemoIncomingCard,
  updateProfileAvatar,
} from './api';
import {
  ApiErrorShape,
  CampusRequest,
  InboxItem,
  RouteCard,
  RutoLanguage,
  ScreenName,
  TransitMode,
  UnplacedStep,
  UserProfile,
  Waypoint,
} from './types';
import { INITIAL_REQUESTS, INITIAL_USERS } from './utils/seedData';
import { computeRouteGeometry } from './utils/geo';
import {
  BottomTabBar,
  DemoMenuModal,
  IncomingCardToast,
  TopAppBar,
} from './components/TopBarAndNav';
import { ExploreScreen, HomeScreen } from './components/HomeAndExploreScreens';
import { DrawScreen } from './components/DrawScreen';
import { RecordPathScreen } from './components/RecordPathScreen';
import { PathDetailScreen } from './components/PathDetailScreen';
import {
  DirectionsScreen,
  SendCardScreen,
} from './components/DirectionsAndSendScreens';
import {
  CardDetailScreen,
  InboxScreen,
} from './components/InboxAndCardDetailScreens';
import { ProfileScreen } from './components/ProfileScreen';

const DEFAULT_DRAFT_WAYPOINTS: Waypoint[] = [
  {
    id: 'wp-init-1',
    name: 'FUOYE Main Gate',
    landmark: 'Security Post',
    turn: 'straight',
    note: 'Meet right outside the security post',
    lat: 7.776812,
    lng: 5.311945,
  },
  {
    id: 'wp-init-2',
    name: 'Food Canopy Junction',
    landmark: 'Food Canopy',
    turn: 'left',
    note: 'Turn left after the food canopy, beside kiosk',
    lat: 7.780115,
    lng: 5.315422,
  },
  {
    id: 'wp-init-3',
    name: "Mary's Hostel Gate",
    landmark: 'Green Hostel Gate',
    turn: 'straight',
    note: 'End at the green gate',
    lat: 7.782415,
    lng: 5.315082,
  },
];

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('home');

  // Session data managed strictly via src/api.ts
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [activeHandle, setActiveHandle] = useState<string>('mary_hostel');
  const [cards, setCards] = useState<RouteCard[]>([]);
  const [requests, setRequests] = useState<CampusRequest[]>(INITIAL_REQUESTS);

  // Inbox state + 5-second visibility-aware polling
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxError, setInboxError] = useState<ApiErrorShape | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [incomingToast, setIncomingToast] = useState<{
    id: string;
    from: string;
    title: string;
  } | null>(null);
  const [unseenCardIds, setUnseenCardIds] = useState<string[]>([]);
  const seenIdsByHandleRef = useRef<Record<string, Set<string>>>({});

  // Draft Route State (Draw -> Directions -> Send)
  const [draftRouteName, setDraftRouteName] = useState('Oye Campus Trail');
  const [draftMode, setDraftMode] = useState<TransitMode>('Walk');
  const [draftLanguage, setDraftLanguage] = useState<RutoLanguage>('Pidgin');
  const [draftWaypoints, setDraftWaypoints] = useState<Waypoint[]>(
    DEFAULT_DRAFT_WAYPOINTS
  );
  const [pendingSteps, setPendingSteps] = useState<UnplacedStep[]>([]);
  const [draftPromptSeed, setDraftPromptSeed] = useState('');
  const [draftRecipient, setDraftRecipient] = useState<string | undefined>(
    undefined
  );

  const [directionsByLang, setDirectionsByLang] = useState<
    Partial<Record<RutoLanguage, string[]>>
  >({});
  const [summaryByLang, setSummaryByLang] = useState<
    Partial<Record<RutoLanguage, string>>
  >({});
  const [generatingDirections, setGeneratingDirections] = useState(false);
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // Selected Card / Path & Demo Controls
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [tamperVersion, setTamperVersion] = useState(0);
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    const data = await getSessionData();
    setUsers(data.profiles);
    setActiveHandle(data.activeHandle);
    setCards(data.cards);
    setRequests(data.requests);
    return data;
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const currentUser: UserProfile =
    users.find((u) => u.handle === activeHandle) || users[0] || INITIAL_USERS[0];

  // Poll getInbox(handle) on demand and every 5 seconds while tab is visible
  const pollInboxNow = useCallback(
    async (handleToFetch: string, isInitialForHandle = false) => {
      if (!handleToFetch) return;
      if (isInitialForHandle) {
        setLoadingInbox(true);
      }

      try {
        const list = await getInbox(handleToFetch);
        setInboxItems(list);
        setInboxError(null);
        setIsReconnecting(false);

        const handleKey = handleToFetch.toLowerCase();
        const prevSeen = seenIdsByHandleRef.current[handleKey];

        if (!prevSeen) {
          seenIdsByHandleRef.current[handleKey] = new Set(
            list.map((i) => i.id)
          );
        } else {
          const newlyArrived = list.filter((item) => !prevSeen.has(item.id));
          if (newlyArrived.length > 0) {
            newlyArrived.forEach((item) => prevSeen.add(item.id));
            const newest = newlyArrived[0];
            setIncomingToast({
              id: newest.id,
              from: newest.from,
              title: newest.title,
            });
            setUnseenCardIds((prev) =>
              Array.from(new Set([...prev, ...newlyArrived.map((n) => n.id)]))
            );
            // Refresh session cards in mock mode so Explore/Inbox details stay in sync
            getSessionData().then((d) => setCards(d.cards));
          }
        }
      } catch (err: unknown) {
        const normalized = normalizeApiError(err);
        if (isInitialForHandle) {
          setInboxError(normalized);
        }
        setIsReconnecting(true);
      } finally {
        if (isInitialForHandle) {
          setLoadingInbox(false);
        }
      }
    },
    []
  );

  // 5-second visibility-aware inbox polling loop
  useEffect(() => {
    const handle = currentUser.handle;
    if (!handle) return;

    pollInboxNow(handle, true);

    let intervalId: number | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          pollInboxNow(handle, false);
        }
      }, 5000);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollInboxNow(handle, false);
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [currentUser.handle, pollInboxNow]);

  // Clear unseen toast IDs when opening Inbox
  useEffect(() => {
    if (screen === 'inbox') {
      setUnseenCardIds([]);
    }
  }, [screen]);

  const handleSwitchUser = useCallback((nextHandle: string) => {
    const normalized = nextHandle.trim().toLowerCase();
    saveActiveHandle(normalized);
    setActiveHandle(normalized);
    setUnseenCardIds([]);
    setIncomingToast(null);
  }, []);

  const handleUpdateDraftWaypoints: React.Dispatch<
    React.SetStateAction<Waypoint[]>
  > = (updater) => {
    setDraftWaypoints(updater);
    setDirectionsByLang({});
    setSummaryByLang({});
  };

  const runGemmaDirections = async (
    targetLang: RutoLanguage,
    navigateOnSuccess: boolean,
    forceRegenerate = false
  ) => {
    if (draftWaypoints.length < 2) return;

    if (!forceRegenerate && directionsByLang[targetLang]?.length) {
      setDraftLanguage(targetLang);
      if (navigateOnSuccess) setScreen('directions');
      return;
    }

    setDraftLanguage(targetLang);
    setGeneratingDirections(true);
    setDirectionsError(null);

    try {
      const geo = computeRouteGeometry(draftWaypoints);
      const result = await generateRouteDirectionsWithGemma({
        language: targetLang,
        mode: draftMode,
        steps: geo.steps,
      });

      const orderedTexts = result.directions.map((d) => d.instruction);
      setDirectionsByLang((prev) => ({ ...prev, [targetLang]: orderedTexts }));
      setSummaryByLang((prev) => ({
        ...prev,
        [targetLang]: result.summaryNote,
      }));

      if (
        draftRouteName === 'Oye Campus Trail' &&
        draftWaypoints.length >= 2
      ) {
        setDraftRouteName(
          `${draftWaypoints[0].name} → ${
            draftWaypoints[draftWaypoints.length - 1].name
          }`
        );
      }

      if (navigateOnSuccess) {
        setScreen('directions');
      }
    } catch (err: unknown) {
      const normalized = normalizeApiError(err);
      setDirectionsError(
        normalized.message ||
          'Gemma 4 could not generate directions right now. Please tap Retry.'
      );
    } finally {
      setGeneratingDirections(false);
    }
  };

  const handleOpenExistingCardInDirections = (card: RouteCard) => {
    setDraftRouteName(card.route.title);
    setDraftMode(card.route.mode);
    setDraftLanguage(card.language);
    setDraftWaypoints(card.route.waypoints.map((w) => ({ ...w })));
    setPendingSteps([]);
    setDirectionsByLang(
      card.route.directionsByLang || { [card.language]: card.directions }
    );
    setSummaryByLang(
      card.route.summaryByLang || { [card.language]: card.route.summaryNote }
    );
    setDirectionsError(null);
    setScreen('directions');
  };

  const handleToggleTamperCard = async (cardId: string) => {
    const updatedCards = await toggleSimulateTampering(cardId);
    setCards(updatedCards);
    setTamperVersion((v) => v + 1);
    pollInboxNow(currentUser.handle, false);
  };

  const handleSimulateIncomingCard = async () => {
    await triggerDemoIncomingCard(currentUser.handle);
    // The 5-second poller will naturally detect and toast it, or if user wants quick feedback within 5s:
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        pollInboxNow(currentUser.handle, false);
      }
    }, 1200);
  };

  const handleResetDemoData = async () => {
    const fresh = await resetMockDemoStorage();
    seenIdsByHandleRef.current = {};
    setUsers(fresh.profiles);
    setActiveHandle(fresh.activeHandle);
    setCards(fresh.cards);
    setRequests(fresh.requests);
    setTamperVersion((v) => v + 1);
    pollInboxNow(fresh.activeHandle, true);
  };

  const pendingInboxCount = inboxItems.filter(
    (item) => item.status === 'pending'
  ).length;
  const badgeCount = Math.max(pendingInboxCount, unseenCardIds.length);

  const hasTamperedCards = cards.some((c) => Boolean(c._untamperedBackup));
  const activeCardId = selectedCardId || inboxItems[0]?.id || cards[0]?.id || null;

  const handleBack = () => {
    if (screen === 'directions') setScreen('draw');
    else if (screen === 'send') setScreen('directions');
    else if (screen === 'card-detail') setScreen('inbox');
    else if (screen === 'path-detail') setScreen('home');
    else setScreen('home');
  };

  return (
    <div className="min-h-screen bg-[#0f141a] text-[#F6F4EE] flex flex-col">
      <TopAppBar
        screen={screen}
        currentUser={currentUser}
        isReconnecting={isReconnecting}
        onRetryConnection={() => pollInboxNow(currentUser.handle, false)}
        onBack={handleBack}
        onGoHome={() => setScreen('home')}
        onOpenUserModal={() => setDemoModalOpen(true)}
        onOpenDemoModal={() => setDemoModalOpen(true)}
        hasTamperedCards={hasTamperedCards}
      />

      <IncomingCardToast
        toast={incomingToast}
        onOpenCard={(cardId) => {
          setIncomingToast(null);
          setSelectedCardId(cardId);
          setScreen('card-detail');
        }}
        onDismiss={() => setIncomingToast(null)}
      />

      <main className="flex-1">
        {screen === 'home' && (
          <HomeScreen
            featuredCard={cards[0]}
            onStartDraw={() => setScreen('draw')}
            onStartRecord={() => setScreen('record')}
            onExplore={() => setScreen('explore')}
            onOpenPath={(pathId) => {
              setSelectedPathId(pathId);
              setScreen('path-detail');
            }}
            onOpenCardDirections={handleOpenExistingCardInDirections}
          />
        )}

        {screen === 'explore' && (
          <ExploreScreen
            cards={cards}
            requests={requests}
            currentUserHandle={currentUser.handle}
            onAddRequest={async (question, tag) => {
              const updated = await addCampusRouteRequest({
                handle: currentUser.handle,
                avatarId: currentUser.avatarId,
                question,
                tag,
              });
              setRequests(updated);
            }}
            onAnswerRequest={(req) => {
              setDraftRouteName(req.suggestedTitle);
              setDraftPromptSeed(req.suggestedPrompt);
              setDraftRecipient(req.handle);
              setDraftWaypoints([]);
              setPendingSteps([]);
              setScreen('draw');
            }}
            onOpenCardDirections={handleOpenExistingCardInDirections}
          />
        )}

        {screen === 'record' && (
          <RecordPathScreen
            currentUserHandle={currentUser.handle}
            onSavedPathOpen={(pathId) => {
              setSelectedPathId(pathId);
              setScreen('path-detail');
            }}
            onSendRecordedAsCard={({ title, mode, waypoints }) => {
              setDraftRouteName(title);
              setDraftMode(mode);
              setDraftWaypoints(waypoints);
              setPendingSteps([]);
              setDirectionsByLang({});
              setSummaryByLang({});
              setScreen('directions');
              // Automatically trigger Gemma 4 directions for the recorded path
              setTimeout(() => {
                const geo = computeRouteGeometry(waypoints);
                setGeneratingDirections(true);
                generateRouteDirectionsWithGemma({
                  language: draftLanguage,
                  mode,
                  steps: geo.steps,
                })
                  .then((res) => {
                    const ordered = res.directions.map((d) => d.instruction);
                    setDirectionsByLang({ [draftLanguage]: ordered });
                    setSummaryByLang({ [draftLanguage]: res.summaryNote });
                  })
                  .catch((err) => {
                    setDirectionsError(normalizeApiError(err).message || null);
                  })
                  .finally(() => setGeneratingDirections(false));
              }, 0);
            }}
          />
        )}

        {screen === 'path-detail' && selectedPathId && (
          <PathDetailScreen
            pathId={selectedPathId}
            onSendAsCard={({ title, mode, language, waypoints, directions }) => {
              setDraftRouteName(title);
              setDraftMode(mode);
              setDraftLanguage(language);
              setDraftWaypoints(waypoints);
              setPendingSteps([]);
              setDirectionsByLang({ [language]: directions });
              setSummaryByLang({ [language]: directions[0] || title });
              setScreen('send');
            }}
          />
        )}

        {screen === 'draw' && (
          <DrawScreen
            key={draftPromptSeed || 'default-draw'}
            routeName={draftRouteName}
            onChangeRouteName={setDraftRouteName}
            mode={draftMode}
            onChangeMode={setDraftMode}
            language={draftLanguage}
            onChangeLanguage={setDraftLanguage}
            waypoints={draftWaypoints}
            onChangeWaypoints={handleUpdateDraftWaypoints}
            pendingSteps={pendingSteps}
            onChangePendingSteps={setPendingSteps}
            initialPromptText={draftPromptSeed}
            isGeneratingDirections={generatingDirections}
            directionsError={directionsError}
            onGetDirections={() => runGemmaDirections(draftLanguage, true)}
          />
        )}

        {screen === 'directions' && (
          <DirectionsScreen
            routeName={draftRouteName}
            mode={draftMode}
            language={draftLanguage}
            waypoints={draftWaypoints}
            directions={directionsByLang[draftLanguage] || []}
            summaryNote={summaryByLang[draftLanguage] || ''}
            isLoadingLanguage={generatingDirections}
            languageError={directionsError}
            onSwitchLanguage={(lang, force) =>
              runGemmaDirections(lang, false, force)
            }
            onSendAsCard={() => setScreen('send')}
            onEditRoute={() => setScreen('draw')}
          />
        )}

        {screen === 'send' && (
          <SendCardScreen
            currentUser={currentUser}
            users={users}
            initialRecipient={draftRecipient}
            routeName={draftRouteName}
            mode={draftMode}
            language={draftLanguage}
            waypoints={draftWaypoints}
            directions={directionsByLang[draftLanguage] || []}
            directionsByLang={directionsByLang}
            summaryNote={summaryByLang[draftLanguage] || ''}
            onCardSentSuccess={() => {
              refreshSession();
              pollInboxNow(currentUser.handle, false);
            }}
            onSwitchUserAndOpenInbox={(targetHandle) => {
              handleSwitchUser(targetHandle);
              setScreen('inbox');
            }}
            onCancel={() => setScreen('inbox')}
          />
        )}

        {screen === 'inbox' && (
          <InboxScreen
            currentUser={currentUser}
            users={users}
            inboxItems={inboxItems}
            allCards={cards}
            loadingInbox={loadingInbox}
            inboxError={inboxError}
            onRefreshInbox={() => pollInboxNow(currentUser.handle, true)}
            onInspectCard={(cardId) => {
              setSelectedCardId(cardId);
              setScreen('card-detail');
            }}
            onCardResponded={() => {
              refreshSession();
              pollInboxNow(currentUser.handle, false);
            }}
            onOpenSwitchUser={() => setDemoModalOpen(true)}
          />
        )}

        {screen === 'card-detail' && activeCardId && (
          <CardDetailScreen
            cardId={activeCardId}
            users={users}
            tamperVersion={tamperVersion}
            onToggleTamper={handleToggleTamperCard}
            onCardUpdated={() => {
              refreshSession();
              pollInboxNow(currentUser.handle, false);
            }}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            users={users}
            onSwitchUser={handleSwitchUser}
            onProfileCreated={async (createdHandle) => {
              saveActiveHandle(createdHandle);
              await refreshSession();
              setActiveHandle(createdHandle);
            }}
            onUpdateAvatar={async (avatarId) => {
              const updated = await updateProfileAvatar(
                currentUser.handle,
                avatarId
              );
              setUsers(updated);
            }}
            onOpenDemoMenu={() => setDemoModalOpen(true)}
            onResetDemoData={handleResetDemoData}
          />
        )}
      </main>

      <BottomTabBar
        screen={screen}
        badgeCount={badgeCount}
        onNavigate={(target) => {
          setDirectionsError(null);
          setScreen(target);
        }}
      />

      <DemoMenuModal
        open={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        users={users}
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
        onGoCreateUser={() => setScreen('profile')}
        cards={cards}
        onToggleTamperCard={handleToggleTamperCard}
        onSimulateIncomingCard={handleSimulateIncomingCard}
        onInspectCard={(cardId) => {
          setSelectedCardId(cardId);
          setScreen('card-detail');
        }}
      />
    </div>
  );
}
