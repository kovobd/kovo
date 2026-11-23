import Ambient from "./Ambient";
import PageTransition from "./PageTransition";
import EffectLayer from "./EffectLayer";
import CartWatcher from "./CartWatcher";
import FirstVisitIntro from "./FirstVisitIntro";
import ContinuousFog from "./ContinuousFog";
import AshParticles from "./AshParticles";
import LightningSystem from "./LightningSystem";
import "./styles.css";

/**
 * Cinematic gothic atmosphere. Only elegant, low-density effects run
 * globally — first-visit intro, continuous soft fog, sparse blurred
 * ash motes, rare distant lightning, ambient moon vignette + raven,
 * and the smoke-based page transition / cart soul-capture handlers.
 */
const PixelFxRoot = () => (
  <>
    <FirstVisitIntro />
    <ContinuousFog />
    <AshParticles />
    <LightningSystem />
    <Ambient />
    <PageTransition />
    <EffectLayer />
    <CartWatcher />
  </>
);

export default PixelFxRoot;
