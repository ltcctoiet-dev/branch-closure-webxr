import { MeshBuilder, Vector3, type Camera, type Mesh, type Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button } from "@babylonjs/gui";
import { uiPalette, uiText } from "../core/theme";
import { router } from "../core/router";
import { store } from "../core/store";

/**
 * The "Pause or ask for help" control.
 *
 * The very first thing the script says to the customer is that they can pause
 * or ask for help AT ANY TIME. A promise like that can't be kept by putting a
 * button on some screens — so this one is attached to the camera and is there
 * for the whole journey.
 *
 * It hides itself on the pause screen, because offering to pause a pause screen
 * is just confusing.
 */

export const PAUSE_SCENE_ID = "pause.anxiety";

export class HelpButton {
  readonly mesh: Mesh;
  private button: Button;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreatePlane("helpControl", { width: 0.46, height: 0.19 }, scene);
    // Low and to the right: easy to reach, out of the way of reading.
    this.mesh.position = new Vector3(0.54, -0.32, 1.1);

    const texture = AdvancedDynamicTexture.CreateForMesh(this.mesh, 512, 212);

    this.button = Button.CreateSimpleButton("helpButton", "Pause or ask for help");
    this.button.cornerRadius = 20;
    this.button.thickness = 4;
    if (this.button.textBlock) this.button.textBlock.textWrapping = true;
    texture.addControl(this.button);

    this.button.onPointerUpObservable.add(() => {
      if (store.get().currentSceneId === PAUSE_SCENE_ID) return;
      void router.push(PAUSE_SCENE_ID);
    });

    this.applyStyle();
    store.subscribeKeys(["largeText", "highContrast", "currentSceneId"], () => this.applyStyle());
  }

  attachTo(camera: Camera): void {
    this.mesh.parent = camera;
  }

  private applyStyle(): void {
    const ui = uiPalette();
    this.button.color = ui.textLight;
    this.button.background = ui.warning;
    this.button.fontSize = uiText().caption;
    this.mesh.setEnabled(store.get().currentSceneId !== PAUSE_SCENE_ID);
  }
}
