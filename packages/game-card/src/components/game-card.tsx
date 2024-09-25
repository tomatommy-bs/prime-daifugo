import { SVGProps } from "react";
import * as svgCards from "./icons";
import { CardId } from "@/tools/suit-num";

const cardIdToModuleName: Record<CardId, keyof typeof svgCards> = {
  "2C": "Svg2C",
  "2D": "Svg2D",
  "2H": "Svg2H",
  "2S": "Svg2S",
  "3C": "Svg3C",
  "3D": "Svg3D",
  "3H": "Svg3H",
  "3S": "Svg3S",
  "4C": "Svg4C",
  "4D": "Svg4D",
  "4H": "Svg4H",
  "4S": "Svg4S",
  "5C": "Svg5C",
  "5D": "Svg5D",
  "5H": "Svg5H",
  "5S": "Svg5S",
  "6C": "Svg6C",
  "6D": "Svg6D",
  "6H": "Svg6H",
  "6S": "Svg6S",
  "7C": "Svg7C",
  "7D": "Svg7D",
  "7H": "Svg7H",
  "7S": "Svg7S",
  "8C": "Svg8C",
  "8D": "Svg8D",
  "8H": "Svg8H",
  "8S": "Svg8S",
  "9C": "Svg9C",
  "9D": "Svg9D",
  "9H": "Svg9H",
  "9S": "Svg9S",
  "10C": "Svg10C",
  "10D": "Svg10D",
  "10H": "Svg10H",
  "10S": "Svg10S",
  AC: "Ac",
  AD: "Ad",
  AH: "Ah",
  AS: "As",
  JC: "Jc",
  JD: "Jd",
  JH: "Jh",
  JS: "Js",
  QC: "Qc",
  QD: "Qd",
  QH: "Qh",
  QS: "Qs",
  KC: "Kc",
  KD: "Kd",
  KH: "Kh",
  KS: "Ks",
} as const;

interface Props extends SVGProps<SVGSVGElement> {
  card: CardId;
}

export const GameCard: React.FC<Props> = ({ card, ...props }) => {
  return svgCards[cardIdToModuleName[card]](props);
};
