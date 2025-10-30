import * as faceapi from '@vladmandic/face-api';

interface ModelStatus {
  name: string;
  loaded: boolean;
  error?: string;
  size?: number;
}

interface ModelValidationResult {
  allLoaded: boolean;
  models: ModelStatus[];
  totalSize: number;
  errors: string[];
}

class ModelManager {
  private static instance: ModelManager;
  private modelsLoaded = false;
  private modelPath = '/models';
  private fallbackPaths = ['/models', './models', `${window.location.origin}/models`, 'models'];
  private loadingPromise: Promise<ModelValidationResult> | null = null;

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Load all required face-api models
   */
  async loadModels(): Promise<ModelValidationResult> {
    // Return existing promise if already loading
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Return cached result if already loaded
    if (this.modelsLoaded) {
      return this.validateModels();
    }

    this.loadingPromise = this.performModelLoading();
    const result = await this.loadingPromise;
    this.loadingPromise = null;

    if (result.allLoaded) {
      this.modelsLoaded = true;
    }

    return result;
  }

  /**
   * Find working model path
   */
  private async findWorkingModelPath(): Promise<string> {
    console.log('Current location:', window.location.href);
    console.log('Protocol:', window.location.protocol);
    
    for (const path of this.fallbackPaths) {
      try {
        const testUrl = `${path}/tiny_face_detector_model-weights_manifest.json`;
        console.log('Testing model path:', testUrl);
        
        // For file:// protocol, we might need to handle differently
        if (window.location.protocol === 'file:') {
          // For file protocol, we need to return the full path that face-api can use
          const basePath = window.location.href.replace('index.html', '');
          const fullModelPath = basePath + path.replace('/', '');
          const testUrl = fullModelPath + '/tiny_face_detector_model-weights_manifest.json';
          console.log('File protocol - trying full path:', testUrl);
          
          try {
            const response = await fetch(testUrl);
            if (response.ok) {
              console.log('✓ Found working model path (file protocol):', fullModelPath);
              return fullModelPath; // Return the full path for file protocol
            }
          } catch (fileError) {
            console.log('File protocol path failed:', testUrl, fileError instanceof Error ? fileError.message : String(fileError));
          }
        }
        
        const response = await fetch(testUrl);
        if (response.ok) {
          console.log('✓ Found working model path:', path);
          return path;
        } else {
          console.log('✗ Path returned status:', response.status, response.statusText);
        }
      } catch (error) {
        console.log('✗ Path failed:', path, error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error('No working model path found');
  }

  /**
   * Perform the actual model loading
   */
  private async performModelLoading(): Promise<ModelValidationResult> {
    const models: ModelStatus[] = [
      { name: 'Tiny Face Detector', loaded: false },
      { name: 'Face Landmark 68', loaded: false },
      { name: 'Face Recognition', loaded: false }
    ];

    const errors: string[] = [];
    let totalSize = 0;

    try {
      console.log('Loading face-api models from:', this.modelPath);

      // Load Tiny Face Detector (Face Detection)
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(this.modelPath);
        models[0].loaded = true;
        models[0].size = this.estimateModelSize('tiny_face_detector');
        console.log('✓ Tiny Face Detector loaded');
      } catch (error) {
        const errorMsg = `Failed to load Tiny Face Detector: ${error}`;
        models[0].error = errorMsg;
        errors.push(errorMsg);
        console.error('✗', errorMsg);
      }

      // Load Face Landmark 68 Point Model
      try {
        await faceapi.nets.faceLandmark68Net.loadFromUri(this.modelPath);
        models[1].loaded = true;
        models[1].size = this.estimateModelSize('face_landmark_68');
        console.log('✓ Face Landmark 68 loaded');
      } catch (error) {
        const errorMsg = `Failed to load Face Landmark 68: ${error}`;
        models[1].error = errorMsg;
        errors.push(errorMsg);
        console.error('✗', errorMsg);
      }

      // Load Face Recognition Model
      try {
        await faceapi.nets.faceRecognitionNet.loadFromUri(this.modelPath);
        models[2].loaded = true;
        models[2].size = this.estimateModelSize('face_recognition');
        console.log('✓ Face Recognition loaded');
      } catch (error) {
        const errorMsg = `Failed to load Face Recognition: ${error}`;
        models[2].error = errorMsg;
        errors.push(errorMsg);
        console.error('✗', errorMsg);
      }

      // Calculate total size
      totalSize = models.reduce((sum, model) => sum + (model.size || 0), 0);

      const allLoaded = models.every(model => model.loaded);

      if (allLoaded) {
        console.log(`✅ All face-api models loaded successfully! Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.warn(`⚠️ Some models failed to load. ${models.filter(m => m.loaded).length}/${models.length} loaded.`);
      }

      return {
        allLoaded,
        models,
        totalSize,
        errors
      };

    } catch (error) {
      const errorMsg = `Critical error loading models: ${error}`;
      errors.push(errorMsg);
      console.error('❌', errorMsg);

      return {
        allLoaded: false,
        models,
        totalSize: 0,
        errors
      };
    }
  }

  /**
   * Validate that models are properly loaded
   */
  async validateModels(): Promise<ModelValidationResult> {
    const models: ModelStatus[] = [
      {
        name: 'Tiny Face Detector',
        loaded: faceapi.nets.tinyFaceDetector.isLoaded,
        size: this.estimateModelSize('tiny_face_detector')
      },
      {
        name: 'Face Landmark 68',
        loaded: faceapi.nets.faceLandmark68Net.isLoaded,
        size: this.estimateModelSize('face_landmark_68')
      },
      {
        name: 'Face Recognition',
        loaded: faceapi.nets.faceRecognitionNet.isLoaded,
        size: this.estimateModelSize('face_recognition')
      }
    ];

    const allLoaded = models.every(model => model.loaded);
    const totalSize = models.reduce((sum, model) => sum + (model.size || 0), 0);
    const errors = models
      .filter(model => !model.loaded)
      .map(model => `${model.name} is not loaded`);

    return {
      allLoaded,
      models,
      totalSize,
      errors
    };
  }

  /**
   * Estimate model size based on model name
   */
  private estimateModelSize(modelName: string): number {
    // Approximate sizes in bytes based on typical face-api model sizes
    const sizes: { [key: string]: number } = {
      'tiny_face_detector': 190 * 1024,     // ~190 KB
      'face_landmark_68': 350 * 1024,       // ~350 KB
      'face_recognition': 6.2 * 1024 * 1024  // ~6.2 MB
    };

    return sizes[modelName] || 0;
  }

  /**
   * Check if all models are loaded
   */
  areModelsLoaded(): boolean {
    return this.modelsLoaded && 
           faceapi.nets.tinyFaceDetector.isLoaded &&
           faceapi.nets.faceLandmark68Net.isLoaded &&
           faceapi.nets.faceRecognitionNet.isLoaded;
  }

  /**
   * Get model loading status
   */
  getModelStatus(): { loaded: boolean; details: string } {
    if (!this.modelsLoaded) {
      return { loaded: false, details: 'Models not loaded' };
    }

    const statuses = [
      { name: 'Tiny Face Detector', loaded: faceapi.nets.tinyFaceDetector.isLoaded },
      { name: 'Face Landmark 68', loaded: faceapi.nets.faceLandmark68Net.isLoaded },
      { name: 'Face Recognition', loaded: faceapi.nets.faceRecognitionNet.isLoaded }
    ];

    const loadedCount = statuses.filter(s => s.loaded).length;
    const totalCount = statuses.length;

    if (loadedCount === totalCount) {
      return { loaded: true, details: `All ${totalCount} models loaded` };
    } else {
      const failedModels = statuses.filter(s => !s.loaded).map(s => s.name);
      return { 
        loaded: false, 
        details: `${loadedCount}/${totalCount} models loaded. Failed: ${failedModels.join(', ')}` 
      };
    }
  }

  /**
   * Reload models (useful for error recovery)
   */
  async reloadModels(): Promise<ModelValidationResult> {
    this.modelsLoaded = false;
    this.loadingPromise = null;
    return this.loadModels();
  }

  /**
   * Get model path
   */
  getModelPath(): string {
    return this.modelPath;
  }

  /**
   * Set custom model path
   */
  setModelPath(path: string): void {
    this.modelPath = path;
    this.modelsLoaded = false; // Force reload with new path
  }
}

export default ModelManager;
export type { ModelStatus, ModelValidationResult };