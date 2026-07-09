import { FadeIn, FadeInDown, FadeInUp, LinearTransition } from "react-native-reanimated";

export const tourEnter = {
  fade: FadeIn.duration(220),
  fadeUp: FadeInUp.duration(320).springify(),
  fadeDown: FadeInDown.duration(320).springify(),
  stagger: (index: number, base = 50) =>
    FadeInDown.delay(Math.min(index * base, 400)).duration(280).springify(),
  layout: LinearTransition.springify(),
};
