<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Dices,
  FileImage,
  Heart,
  Grid2X2,
  HelpCircle,
  History,
  House,
  ImagePlus,
  Info,
  LogIn,
  MessageSquare,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sigma,
  Sparkles,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Square,
  Trash2,
  Upload,
  UserRound,
  X,
} from '@lucide/vue'

const icons = {
  home: House,
  book: BookOpen,
  sparkles: Sparkles,
  filter: SlidersHorizontal,
  stop: Square,
  eye: Eye,
  eyeOff: EyeOff,
  user: UserRound,
  camera: Camera,
  history: History,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  chevron: ChevronRight,
  clock: Clock3,
  copy: Copy,
  download: Download,
  image: FileImage,
  heart: Heart,
  help: HelpCircle,
  imagePlus: ImagePlus,
  info: Info,
  login: LogIn,
  message: MessageSquare,
  pencil: Pencil,
  plus: Plus,
  rotate: RotateCw,
  search: Search,
  send: Send,
  settings: Settings,
  shield: ShieldCheck,
  trash: Trash2,
  upload: Upload,
  close: X,
  check: Check,
  sigma: Sigma,
  matrix: Grid2X2,
  dice: Dices,
  atom: Atom,
}
withDefaults(defineProps<{ name: keyof typeof icons; size?: number }>(), { size: 20 })
</script>

<template>
  <component
    :is="icons[name]"
    :size="size"
    :stroke-width="1.7"
    class="app-icon"
    aria-hidden="true"
  />
</template>
