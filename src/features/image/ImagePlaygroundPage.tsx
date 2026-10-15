import { useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type ImageGeneration } from '@/lib/data';
import { Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Alert, Spinner, Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components';
import { Plus, Download, Upload, X, Image as ImageIcon, Wand2, ScanLine, PenTool, Trash2 } from 'lucide-react';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  type: 'generate' | 'edit' | 'understand';
}

interface HistoryItem {
  id: string;
  prompt: string;
  imageUrl: string;
  type: 'generate' | 'edit' | 'understand';
  size: string;
  style: string;
  count: number;
  timestamp: number;
}

const SIZE_TO_ASPECT: Record<string, string> = { '1024x1024': '1:1', '1792x1024': '16:9', '1024x1792': '9:16' };
const ASPECT_TO_SIZE: Record<string, string> = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };

function toHistoryItem(generation: ImageGeneration): HistoryItem {
  return {
    id: generation.id,
    prompt: generation.prompt,
    imageUrl: generation.images[0]?.url ?? '',
    type: generation.mode,
    size: ASPECT_TO_SIZE[generation.aspectRatio] ?? '1024x1024',
    style: generation.style || 'auto',
    count: generation.imageCount,
    timestamp: Date.parse(generation.createdAt),
  };
}

export function ImagePlaygroundPage() {
  const { t, i18n } = useTranslation();
  const images = useRepository('images');
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('generate');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [style, setStyle] = useState('auto');
  const [imageCount, setImageCount] = useState(1);
  const [inputImage, setInputImage] = useState<File | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [understandingResult, setUnderstandingResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const generations = useQuery({ queryKey: ['images', 'generations'], queryFn: () => images.listGenerations() });
  const history: HistoryItem[] = (generations.data ?? []).map(toHistoryItem);
  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: ['images', 'generations'] });

  const templates = [
    { id: 'photo', label: t('images.templatePhoto') },
    { id: 'illustration', label: t('images.templateIllustration') },
    { id: '3d', label: t('images.template3d') },
    { id: 'logo', label: t('images.templateLogo') },
    { id: 'concept', label: t('images.templateConcept') },
  ];

  const sizes = [
    { value: '1024x1024', label: t('images.sizeSquare') },
    { value: '1792x1024', label: t('images.sizeLandscape') },
    { value: '1024x1792', label: t('images.sizePortrait') },
  ];

  const styles = [
    { value: 'auto', label: t('images.styleAuto') },
    { value: 'vivid', label: t('images.styleVivid') },
    { value: 'natural', label: t('images.styleNatural') },
  ];


  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('images.errors.selectImageFile'));
      return;
    }
    setInputImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setInputImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setError('');
  }

  function clearImage() {
    setInputImage(null);
    setInputImagePreview(null);
  }

  function deleteHistoryItem(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    images
      .deleteGeneration(id)
      .then(refreshHistory)
      .catch((err: unknown) => setError(apiErrorMessage(err)));
  }

  function clearHistory() {
    if (!confirm(t('images.clearHistoryConfirm'))) return;
    Promise.all(history.map((item) => images.deleteGeneration(item.id)))
      .then(refreshHistory)
      .catch((err: unknown) => setError(apiErrorMessage(err)));
  }

  function restoreHistoryItem(item: HistoryItem) {
    setPrompt(item.prompt);
    if (item.type === 'generate') {
      setSize(item.size);
      setStyle(item.style);
      setImageCount(item.count);
      setActiveTab('generate');
    }
  }

  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError(t('images.errors.enterPrompt'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const generation = await images.generate({
        prompt,
        negativePrompt: negativePrompt || undefined,
        model: 'auto',
        aspectRatio: SIZE_TO_ASPECT[size] ?? '1:1',
        style: style === 'auto' ? '' : style,
        imageCount,
      });
      const newImages: GeneratedImage[] = generation.images.map((img) => ({
        id: img.id,
        url: img.url,
        prompt,
        type: 'generate',
      }));
      setGeneratedImages((prev) => [...newImages, ...prev]);
      void refreshHistory();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnderstand() {
    if (!inputImage) {
      setError(t('images.errors.uploadFirst'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const question = prompt || t('images.defaultQuestion');
      const answer = await images.understand(inputImagePreview ?? '', question);
      setUnderstandingResult(answer || t('images.errors.noResult'));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (!inputImage || !prompt.trim()) {
      setError(t('images.errors.uploadAndPrompt'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const generation = await images.edit({
        prompt,
        instruction: prompt,
        referenceImageRef: inputImagePreview ?? '',
        model: 'auto',
        aspectRatio: SIZE_TO_ASPECT[size] ?? '1:1',
        style: style === 'auto' ? '' : style,
        imageCount: 1,
      });
      const newImages: GeneratedImage[] = generation.images.map((img) => ({ id: img.id, url: img.url, prompt, type: 'edit' }));
      setGeneratedImages((prev) => [...newImages, ...prev]);
      void refreshHistory();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function renderPreviewArea() {
    if (busy && !generatedImages.length) {
      return (
        <div className="image-preview-area">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Spinner size="lg" />
            <p className="text-sm">{t('images.generating')}</p>
          </div>
        </div>
      );
    }

    if (generatedImages.length > 0 && (activeTab === 'generate' || (activeTab === 'edit' && generatedImages.some((img) => img.type === 'edit')))) {
      const displayImages = activeTab === 'edit'
        ? generatedImages.filter((img) => img.type === 'edit')
        : generatedImages;
      if (displayImages.length > 0) {
        const firstImage = displayImages[0];
        return (
          <div className="space-y-4">
            <div className="image-preview-area">
              {firstImage && <img src={firstImage.url} alt={firstImage.prompt} className="max-w-full max-h-[400px] rounded-md object-contain" />}
            </div>
            {displayImages.length > 1 && (
              <div className="image-gallery">
                {displayImages.slice(1).map((img) => (
                  <div key={img.id} className="image-thumb group">
                    <img src={img.url} alt={img.prompt} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(img.url, '_blank')}
                      className="absolute top-2 right-2 w-7 h-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
    }

    if (activeTab === 'understand') {
      return (
        <div className="image-preview-area">
          {understandingResult ? (
            <div className="text-left w-full">
              <h3 className="font-medium text-foreground mb-2">{t('images.analysis')}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{understandingResult}</p>
            </div>
          ) : inputImagePreview ? (
            <img src={inputImagePreview} alt="Preview" className="max-w-full max-h-[400px] rounded-md object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ImageIcon size={48} className="text-muted-foreground/40" />
              <div>
                <p className="text-muted-foreground mb-1">{t('images.uploadToGetStarted')}</p>
                <p className="text-xs text-muted-foreground">{t('images.fileTypesHint')}</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="image-preview-area">
        <div className="flex flex-col items-center gap-3">
          <ImageIcon size={48} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('images.generatedHere')}</p>
        </div>
      </div>
    );
  }

  const selectClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all';

  return (
    <section className="workspace image-playground">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('images.eyebrow')}</p>
          <h1>{t('images.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('images.subtitle')}</p>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="inline-flex h-auto w-auto p-1 bg-secondary rounded-md mb-6">
          <TabsTrigger value="generate" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-sm">
            <Wand2 size={16} /> {t('images.tabs.generate')}
          </TabsTrigger>
          <TabsTrigger value="edit" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-sm">
            <PenTool size={16} /> {t('images.tabs.edit')}
          </TabsTrigger>
          <TabsTrigger value="understand" className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-sm">
            <ScanLine size={16} /> {t('images.tabs.understand')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <Textarea label={t('images.promptLabel')} placeholder={t('images.promptPlaceholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
              <Textarea label={t('images.negativePromptLabel')} placeholder={t('images.negativePromptPlaceholder')} value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">{t('images.sizeLabel')}</label>
                  <select value={size} onChange={(e) => setSize(e.target.value)} className={selectClass}>
                    {sizes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">{t('images.styleLabel')}</label>
                  <select value={style} onChange={(e) => setStyle(e.target.value)} className={selectClass}>
                    {styles.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground">{t('images.countLabel')}</label>
                  <select value={imageCount} onChange={(e) => setImageCount(parseInt(e.target.value))} className={selectClass}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowMoreOptions(!showMoreOptions)} className="text-muted-foreground hover:text-foreground gap-1 px-0">
                <Plus size={14} style={{ transform: showMoreOptions ? 'rotate(45deg)' : 'none' }} /> {t('images.moreOptions')}
              </Button>
              {showMoreOptions && <Input label={t('images.seedLabel')} placeholder={t('images.seedPlaceholder')} type="number" />}
              <Button onClick={() => void handleGenerate()} disabled={busy || !prompt.trim()} className="w-full" size="lg">
                {busy ? <Spinner size="sm" /> : t('images.generateButton')}
              </Button>
            </div>
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{t('images.preview')}</CardTitle>
              </CardHeader>
              <CardContent>{renderPreviewArea()}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="edit">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              {!inputImagePreview ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-controls="image-edit-upload"
                  className="image-upload-zone"
                  onClick={() => document.getElementById('image-edit-upload')?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      document.getElementById('image-edit-upload')?.click();
                    }
                  }}
                >
                  <span className="image-upload-icon"><Upload size={22} /></span>
                  <p className="image-upload-title">{t('images.uploadToEdit')}</p>
                  <p className="image-upload-hint">{t('images.fileTypesHint')}</p>
                  <input id="image-edit-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </div>
              ) : (
                <div className="image-upload-preview">
                  <img src={inputImagePreview} alt="Upload preview" className="w-full max-h-[200px] object-cover" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearImage}
                  className="absolute top-3 right-3 w-8 h-8 p-0"
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}
              <Textarea label={t('images.editPromptLabel')} placeholder={t('images.editPromptPlaceholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground">{t('images.sizeLabel')}</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className={selectClass}>
                  {sizes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <Button onClick={() => void handleEdit()} disabled={busy || !inputImage || !prompt.trim()} className="w-full" size="lg">
                {busy ? <Spinner size="sm" /> : t('images.editButton')}
              </Button>
            </div>
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{t('images.editedResult')}</CardTitle>
              </CardHeader>
              <CardContent>
                {generatedImages.filter((img) => img.type === 'edit').length > 0 ? (
                  (() => {
                    const edit = generatedImages.filter((img) => img.type === 'edit')[0];
                    return edit ? <img src={edit.url} alt="Edited result" className="w-full rounded-md object-contain max-h-[400px]" /> : null;
                  })()
                ) : (
                  <div className="image-preview-area">
                    <div className="flex flex-col items-center gap-3">
                      <ImageIcon size={48} className="text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t('images.uploadEditHint')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="understand">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              {!inputImagePreview ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-controls="image-understand-upload"
                  className="image-upload-zone"
                  onClick={() => document.getElementById('image-understand-upload')?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      document.getElementById('image-understand-upload')?.click();
                    }
                  }}
                >
                  <span className="image-upload-icon"><Upload size={22} /></span>
                  <p className="image-upload-title">{t('images.uploadToAnalyze')}</p>
                  <p className="image-upload-hint">{t('images.fileTypesHint')}</p>
                  <input id="image-understand-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </div>
              ) : (
                <div className="image-upload-preview">
                  <img src={inputImagePreview} alt="Upload preview" className="w-full max-h-[200px] object-cover" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearImage}
                  className="absolute top-3 right-3 w-8 h-8 p-0"
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}
              <Textarea label={t('images.questionLabel')} placeholder={t('images.questionPlaceholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
              <Button onClick={() => void handleUnderstand()} disabled={busy || !inputImage} className="w-full" size="lg">
                {busy ? <Spinner size="sm" /> : t('images.analyzeButton')}
              </Button>
            </div>
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{t('images.analysisResult')}</CardTitle>
              </CardHeader>
              <CardContent>
                {understandingResult ? (
                  <div className="prose max-w-none text-sm whitespace-pre-wrap text-foreground">{understandingResult}</div>
                ) : (
                  <div className="image-preview-area">
                    <div className="flex flex-col items-center gap-3">
                      <ImageIcon size={48} className="text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t('images.uploadAnalyzeHint')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('images.templates')}</h3>
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <Button
              key={template.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPrompt((prev) => `${prev} ${template.label.toLowerCase()}`.trim())}
              className="text-muted-foreground hover:text-primary hover:border-primary"
            >
              {template.label}
            </Button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-foreground">{t('nav.history')}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={clearHistory}>
              {t('history.clearHistory')}
            </Button>
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => restoreHistoryItem(item)}
                className="group relative rounded-md border border-border bg-card overflow-hidden cursor-pointer hover:border-primary hover:bg-secondary/30 transition-colors"
              >
                <div className="aspect-square w-full bg-muted/50">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.prompt} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon size={24} />
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-xs text-foreground line-clamp-2 font-medium">{item.prompt}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                        item.type === 'generate'
                          ? 'bg-primary/10 text-primary'
                          : item.type === 'edit'
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTimestamp(item.timestamp)}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => deleteHistoryItem(item.id, e)}
                  className="absolute top-2 right-2 w-7 h-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
