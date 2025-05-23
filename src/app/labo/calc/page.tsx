'use client'

import { PlayingCardLine } from '@/components/playing-card-line'
import { type CardId, GameCard, getCardNum } from '@/game-card/src'
import { concatCardNumbers } from '@/utils/play-card'
import pf from 'primes-and-factors'

import { ActionIcon, Alert, Button, Grid, GridCol, Group, Kbd, NumberInput } from '@mantine/core'
import { useHotkeys, useViewportSize } from '@mantine/hooks'
import { IconBackspace, IconCheck, IconCircleX, IconExclamationCircle } from '@tabler/icons-react'
import type { NextPage } from 'next'
import { type Dispatch, type SetStateAction, useState } from 'react'

const cardIds: CardId[] = [
  'AC',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  '10C',
  'JC',
  'QC',
  'KC',
] as const

const Page: NextPage = () => {
  const [selectedCards, setSelectedCards] = useState<CardId[]>([])
  const { width } = useViewportSize()

  const calculatedNumber = concatCardNumbers(selectedCards)
  const isPrimeNumber = Number.isNaN(calculatedNumber) ? true : pf.isPrime(calculatedNumber)

  useKeyPress(setSelectedCards)

  const handleClickCardOnLine = (_: CardId, idx: number) => {
    setSelectedCards((prev) => {
      const newSelectedCards = [...prev]
      newSelectedCards.splice(idx, 1)
      return newSelectedCards
    })
  }

  const handleClickInputCard = (cardId: CardId) => {
    setSelectedCards((prev) => {
      const newSelectedCards = [...prev, cardId]
      return newSelectedCards
    })
  }

  return (
    <div className="sm:container  mx-auto">
      <Grid className="px-4">
        <GridCol span={'auto'}>
          <NumberInput
            color="green"
            leftSection={isPrimeNumber ? <IconCheck /> : <IconCircleX />}
            readOnly={true}
            thousandSeparator={true}
            value={calculatedNumber}
            error={
              !isPrimeNumber ? (
                <span className="font-extrabold bg-white rounded-md p-1">
                  {calculatedNumber} =
                  {(calculatedNumber === 1 ? [1] : pf.getFactors(calculatedNumber)).join(' x ')}
                </span>
              ) : (
                false
              )
            }
          />
          {calculatedNumber > Number.MAX_SAFE_INTEGER && (
            <Alert
              icon={<IconExclamationCircle />}
              title="Number too large"
              variant="filled"
              color="red"
            >
              <p>
                Javascript で扱える最大の整数は {Number.MAX_SAFE_INTEGER.toLocaleString()} です。
              </p>
            </Alert>
          )}
          <Group>
            <PlayingCardLine
              size="s"
              cardIds={selectedCards}
              onClickCard={handleClickCardOnLine}
              className="min-h-20 my-4 flex-1"
            />
            <ActionIcon onClick={() => setSelectedCards((prev) => prev.slice(0, -1))} size="lg">
              <IconBackspace className="flex-auto" />
            </ActionIcon>
          </Group>
        </GridCol>
        <GridCol span={{ xs: 4, sm: 4 }}>
          <Grid className="text-[4rem]" columns={12}>
            {cardIds.map((cardId) => (
              <GridCol span={4} key={cardId} className="flex justify-center">
                <button
                  type="button"
                  className="relative"
                  onClick={() => handleClickInputCard(cardId)}
                >
                  <Kbd className="absolute translate-x-1/2 -translate-y-1/3">
                    {getCardNum(cardId) === '10'
                      ? '0'
                      : getCardNum(cardId) === 'A'
                        ? '1'
                        : getCardNum(cardId)}
                  </Kbd>
                  <GameCard card={cardId} fontSize={width < 1000 ? '3rem' : '4rem'} />
                </button>
              </GridCol>
            ))}
            <GridCol span={8} className="w-fit">
              <Button
                className="uppercase"
                fullWidth={true}
                leftSection={<Kbd size="xs">esc</Kbd>}
                onClick={() => setSelectedCards([])}
              >
                clear
              </Button>
            </GridCol>
          </Grid>
        </GridCol>
      </Grid>
    </div>
  )
}

const useKeyPress = (callback: Dispatch<SetStateAction<CardId[]>>) =>
  useHotkeys([
    ['escape', () => callback([])],
    ['backspace', () => callback((prev) => prev.slice(0, -1))],
    ['mod+backspace', () => callback([])],
    ['1', () => callback((prev) => [...prev, 'AC'])],
    ['2', () => callback((prev) => [...prev, '2C'])],
    ['3', () => callback((prev) => [...prev, '3C'])],
    ['4', () => callback((prev) => [...prev, '4C'])],
    ['5', () => callback((prev) => [...prev, '5C'])],
    ['6', () => callback((prev) => [...prev, '6C'])],
    ['7', () => callback((prev) => [...prev, '7C'])],
    ['8', () => callback((prev) => [...prev, '8C'])],
    ['9', () => callback((prev) => [...prev, '9C'])],
    ['0', () => callback((prev) => [...prev, '10C'])],
    ['j', () => callback((prev) => [...prev, 'JC'])],
    ['q', () => callback((prev) => [...prev, 'QC'])],
    ['k', () => callback((prev) => [...prev, 'KC'])],
  ])

export default Page
