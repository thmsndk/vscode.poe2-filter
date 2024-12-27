import { ColorValue, ShapeValue } from "./tokens";

export enum ActionType {
  Continue = "Continue",
  CustomAlertSound = "CustomAlertSound",
  CustomAlertSoundOptional = "CustomAlertSoundOptional",
  DisableDropSound = "DisableDropSound",
  DisableDropSoundIfAlertSound = "DisableDropSoundIfAlertSound",
  EnableDropSound = "EnableDropSound",
  EnableDropSoundIfAlertSound = "EnableDropSoundIfAlertSound",
  MinimapIcon = "MinimapIcon",
  PlayAlertSound = "PlayAlertSound",
  PlayAlertSoundPositional = "PlayAlertSoundPositional",
  PlayEffect = "PlayEffect",
  SetBackgroundColor = "SetBackgroundColor",
  SetBorderColor = "SetBorderColor",
  SetFontSize = "SetFontSize",
  SetTextColor = "SetTextColor",
}

export interface ActionSyntax {
  type: ActionType;
  parameters: {
    name: string;
    type: "number" | "string" | "color" | "shape" | "boolean";
    required: boolean;
    range?: { min: number; max: number };
    defaultValue?: number | string;
    description: string;
  }[];
  disabledValue?: string | number;
  description: string;
}

export const ActionSyntaxMap: Record<ActionType, ActionSyntax> = {
  [ActionType.Continue]: {
    type: ActionType.Continue,
    parameters: [],
    description: "Continues processing rules after this block",
  },
  [ActionType.CustomAlertSound]: {
    type: ActionType.CustomAlertSound,
    parameters: [
      {
        name: "Path",
        type: "string",
        required: true,
        description: "Path to the sound file",
      },
      {
        name: "Volume",
        type: "number",
        required: false,
        range: { min: 0, max: 300 },
        defaultValue: 50,
        description: "Volume percentage (0-300)",
      },
    ],
    description: "Plays a custom alert sound when item drops",
  },
  [ActionType.CustomAlertSoundOptional]: {
    type: ActionType.CustomAlertSoundOptional,
    parameters: [
      {
        name: "Path",
        type: "string",
        required: true,
        description: "Path to the sound file (relative to PoE directory)",
      },
      {
        name: "Volume",
        type: "number",
        required: false,
        range: { min: 0, max: 300 },
        defaultValue: 50,
        description: "Volume percentage (0-300%)",
      },
    ],
    description:
      "Plays a custom alert sound if file exists, silently continues if not found",
  },
  [ActionType.DisableDropSound]: {
    type: ActionType.DisableDropSound,
    parameters: [
      {
        name: "Enabled",
        type: "boolean",
        required: false,
        description: "Whether the drop sound is enabled",
      },
    ],
    description: "Disables the default drop sound for this item",
  },
  [ActionType.DisableDropSoundIfAlertSound]: {
    type: ActionType.DisableDropSoundIfAlertSound,
    parameters: [
      {
        name: "Enabled",
        type: "boolean",
        required: false,
        description: "Whether the drop sound is enabled",
      },
    ],
    description: "Disables the default drop sound if an alert sound is played",
  },
  [ActionType.EnableDropSound]: {
    type: ActionType.EnableDropSound,
    parameters: [],
    description: "Enables the default drop sound for this item",
  },
  [ActionType.EnableDropSoundIfAlertSound]: {
    type: ActionType.EnableDropSoundIfAlertSound,
    parameters: [],
    description:
      "Enables the default drop sound even if an alert sound is played",
  },
  [ActionType.MinimapIcon]: {
    type: ActionType.MinimapIcon,
    parameters: [
      {
        name: "Size",
        type: "number",
        required: true,
        range: { min: -1, max: 2 },
        description: "Icon size (0=Small, 1=Medium, 2=Large)",
      },
      {
        name: "Color",
        type: "color",
        required: true,
        description: `Icon color (${Object.values(ColorValue).join(", ")})`,
      },
      {
        name: "Shape",
        type: "shape",
        required: true,
        description: `Icon shape (${Object.values(ShapeValue).join(", ")})`,
      },
    ],
    disabledValue: -1,
    description: "Shows an icon on the minimap where the item dropped",
  },
  [ActionType.PlayAlertSound]: {
    type: ActionType.PlayAlertSound,
    parameters: [
      {
        name: "SoundId",
        type: "number",
        required: true,
        range: { min: 1, max: 16 },
        description: "Built-in sound effect ID",
      },
      {
        name: "Volume",
        type: "number",
        required: false,
        range: { min: 0, max: 300 },
        defaultValue: 50,
        description: "Volume (0-300)",
      },
    ],
    disabledValue: "None",
    description: "Plays a built-in alert sound when item drops",
  },
  [ActionType.PlayAlertSoundPositional]: {
    type: ActionType.PlayAlertSoundPositional,
    parameters: [
      {
        name: "SoundId",
        type: "number",
        required: true,
        range: { min: 1, max: 16 },
        description: "Built-in sound effect ID",
      },
      {
        name: "Volume",
        type: "number",
        required: false,
        range: { min: 0, max: 300 },
        defaultValue: 50,
        description: "Volume (0-300)",
      },
    ],
    disabledValue: "None",
    description:
      "Plays a built-in alert sound with positional audio when item drops",
  },
  [ActionType.PlayEffect]: {
    type: ActionType.PlayEffect,
    parameters: [
      {
        name: "Color",
        type: "color",
        required: true,
        description: "Color of the effect",
      },
      {
        name: "Temp",
        type: "string", // TODO: this is wrong, the value is Temp
        required: false,
        description: "Temporary effect",
      },
    ],
    disabledValue: "None",
    description: "Plays a colored effect on the item",
  },
  [ActionType.SetBackgroundColor]: {
    type: ActionType.SetBackgroundColor,
    parameters: [
      {
        name: "Red",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Red component (0-255)",
      },
      {
        name: "Green",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Green component (0-255)",
      },
      {
        name: "Blue",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Blue component (0-255)",
      },
      {
        name: "Alpha",
        type: "number",
        required: false,
        range: { min: 0, max: 255 },
        defaultValue: 255,
        description: "Transparency (0=transparent, 255=opaque)",
      },
    ],
    description: "Sets the background color of the item",
  },
  [ActionType.SetBorderColor]: {
    type: ActionType.SetBorderColor,
    parameters: [
      {
        name: "Red",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Red component (0-255)",
      },
      {
        name: "Green",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Green component (0-255)",
      },
      {
        name: "Blue",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Blue component (0-255)",
      },
      {
        name: "Alpha",
        type: "number",
        required: false,
        range: { min: 0, max: 255 },
        defaultValue: 255,
        description: "Transparency (0=transparent, 255=opaque)",
      },
    ],
    description: "Sets the border color of the item",
  },
  [ActionType.SetFontSize]: {
    type: ActionType.SetFontSize,
    parameters: [
      {
        name: "Size",
        type: "number",
        required: true,
        range: { min: 1, max: 45 },
        description: "Font size in points",
      },
    ],
    description: "Sets the size of the item's text",
  },
  [ActionType.SetTextColor]: {
    type: ActionType.SetTextColor,
    parameters: [
      {
        name: "Red",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Red component (0-255)",
      },
      {
        name: "Green",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Green component (0-255)",
      },
      {
        name: "Blue",
        type: "number",
        required: true,
        range: { min: 0, max: 255 },
        description: "Blue component (0-255)",
      },
      {
        name: "Alpha",
        type: "number",
        required: false,
        range: { min: 0, max: 255 },
        defaultValue: 255,
        description: "Transparency (0=transparent, 255=opaque)",
      },
    ],
    description: "Sets the color of the item's text",
  },
};
