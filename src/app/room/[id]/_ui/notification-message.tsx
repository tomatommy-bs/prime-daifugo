import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { concatCardNumbers, concatFactCardIds } from '@/utils/play-card'
import { Badge } from '@mantine/core'
import type React from 'react'

const Chat: React.FC<{
  sender?: string
  message?: string
}> = (props) => {
  if (props.sender === undefined) {
    return <>{props.message}</>
  }
  return (
    <>
      <Badge size="xs">{props.sender}</Badge>: {props.message}
    </>
  )
}

const OnPass: React.FC<{
  sender?: string
}> = (props) => (
  <>
    <Badge size="xs">{props.sender}</Badge> がパスしました
  </>
)

const OnSubmitSuccessful: React.FC<{
  sender?: string
  submit: CardId[]
  factor?: FactCardId[]
}> = (props) => {
  if (props.factor !== undefined) {
    return (
      <>
        <Badge size="xs">{props.sender}</Badge> が<b>{concatCardNumbers(props.submit)}</b> ={' '}
        <b>{concatFactCardIds(props.factor)}</b>
        を出しました
      </>
    )
  }
  return (
    <>
      <Badge size="xs">{props.sender}</Badge> が<b>{concatCardNumbers(props.submit)}</b>を出しました
    </>
  )
}

const OnSubmitWithGrothendieck: React.FC<{
  sender?: string
  submit: CardId[]
}> = (props) => {
  return (
    <>
      <Badge size="xs">{props.sender}</Badge> の <b>グロタンディーク素数</b>
      切り！
    </>
  )
}

const OnSubmitNotPrime: React.FC<{
  sender?: string
  submit: CardId[]
}> = (props) => {
  return (
    <>
      <Badge size="xs">{props.sender}</Badge> が<b>{concatCardNumbers(props.submit)}</b>
      を出しましたが、素数ではありません
    </>
  )
}

const OnSubmitWithInvalidFactor: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => {
  return (
    <>
      <Badge size="xs">{props.sender}</Badge> が<b>{concatCardNumbers(props.submit)}</b> =
      <b>{concatFactCardIds(props.factor)}</b>
      を出しましたが素因数分解として成立していません
    </>
  )
}

const OnSubmitWithPrimeFactor: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => {
  return (
    <>
      <Badge size="xs">{props.sender}</Badge>が<b>{concatCardNumbers(props.submit)}</b> =
      <b>{concatFactCardIds(props.factor)}</b>
      を出しましたが因数に素数以外のカードが含まれています
    </>
  )
}

const OnSubmitWithWrongEquation: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => {
  return (
    <>
      <Badge size="xs">{props.sender}</Badge>が<b>{concatCardNumbers(props.submit)}</b> =
      <b>{concatFactCardIds(props.factor)}</b>
      を出しましたが等式が間違っています
    </>
  )
}

const NotifyMessageContent = {
  Chat,
  OnPass,
  OnSubmitSuccessful,
  OnSubmitWithGrothendieck,
  OnSubmitNotPrime,
  OnSubmitWithInvalidFactor,
  OnSubmitWithPrimeFactor,
  OnSubmitWithWrongEquation,
}

export default NotifyMessageContent
