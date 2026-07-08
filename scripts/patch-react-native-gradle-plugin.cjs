const fs = require('fs');
const path = require('path');

patchReactNativeGradlePlugin();
patchOnnxRuntimeReactNative();
patchOnnxRuntimeTensorUtils();

function patchReactNativeGradlePlugin() {
  const settingsPath = path.join(
    __dirname,
    '..',
    'node_modules',
    '@react-native',
    'gradle-plugin',
    'settings.gradle.kts',
  );

  if (!fs.existsSync(settingsPath)) {
    console.warn(`[patch] React Native Gradle plugin settings not found: ${settingsPath}`);
    return;
  }

  const source = fs.readFileSync(settingsPath, 'utf8');
  const patched = source.replace(
    'org.gradle.toolchains.foojay-resolver-convention").version("0.5.0"',
    'org.gradle.toolchains.foojay-resolver-convention").version("1.0.0"',
  );

  if (source === patched) {
    console.log('[patch] React Native Gradle plugin Foojay version already patched or pattern not found.');
    return;
  }

  fs.writeFileSync(settingsPath, patched);
  console.log('[patch] React Native Gradle plugin Foojay resolver updated to 1.0.0 for Gradle 9 compatibility.');
}

function patchOnnxRuntimeReactNative() {
  const buildGradlePath = path.join(
    __dirname,
    '..',
    'node_modules',
    'onnxruntime-react-native',
    'android',
    'build.gradle',
  );

  if (!fs.existsSync(buildGradlePath)) {
    console.warn(`[patch] onnxruntime-react-native build.gradle not found: ${buildGradlePath}`);
    return;
  }

  const source = fs.readFileSync(buildGradlePath, 'utf8');
  const patched = source.replace(
    'if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) {',
    'if (REACT_NATIVE_MINOR_VERSION < 71) {',
  );

  if (source === patched) {
    console.log('[patch] onnxruntime-react-native VersionNumber usage already patched or pattern not found.');
    return;
  }

  fs.writeFileSync(buildGradlePath, patched);
  console.log('[patch] onnxruntime-react-native VersionNumber usage replaced for Gradle 9 compatibility.');
}

function patchOnnxRuntimeTensorUtils() {
  const tensorUtilsPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'onnxruntime-react-native',
    'cpp',
    'TensorUtils.cpp',
  );

  if (!fs.existsSync(tensorUtilsPath)) {
    console.warn(`[patch] onnxruntime-react-native TensorUtils.cpp not found: ${tensorUtilsPath}`);
    return;
  }

  const source = fs.readFileSync(tensorUtilsPath, 'utf8');
  if (source.includes('value.FillStringTensor(stringPointers.data(), stringPointers.size())')) {
    console.log('[patch] onnxruntime-react-native string tensor creation already patched.');
    return;
  }

  const original = `  void* data = nullptr;
  auto dataObj = dataProperty.asObject(runtime);

  if (type == ONNX_TENSOR_ELEMENT_DATA_TYPE_STRING) {
    if (!dataObj.isArray(runtime)) {
      throw JSError(runtime, "Tensor data must be an array of strings");
    }
    auto array = dataObj.asArray(runtime);
    auto size = array.size(runtime);
    data = new char*[size];
    for (size_t i = 0; i < size; ++i) {
      auto item = array.getValueAtIndex(runtime, i);
      static_cast<char**>(data)[i] =
          strdup(item.toString(runtime).utf8(runtime).c_str());
    }
  } else {
    if (!isTypedArray(runtime, dataObj)) {
      throw JSError(runtime, "Tensor data must be a TypedArray");
    }
    auto buffer = dataObj.getProperty(runtime, "buffer")
                      .asObject(runtime)
                      .getArrayBuffer(runtime);
    data = buffer.data(runtime);
  }

  std::vector<int64_t> shape;
  auto dimsArray = dimsProperty.asObject(runtime).asArray(runtime);
  for (size_t i = 0; i < dimsArray.size(runtime); ++i) {
    auto dim = dimsArray.getValueAtIndex(runtime, i);
    if (dim.isNumber()) {
      shape.push_back(static_cast<int64_t>(dim.asNumber()));
    }
  }

  return Ort::Value::CreateTensor(memoryInfo, data,
                                  getElementCount(shape) * getElementSize(type),
                                  shape.data(), shape.size(), type);`;

  const replacement = `  void* data = nullptr;
  std::vector<std::string> stringData;
  auto dataObj = dataProperty.asObject(runtime);

  if (type == ONNX_TENSOR_ELEMENT_DATA_TYPE_STRING) {
    if (!dataObj.isArray(runtime)) {
      throw JSError(runtime, "Tensor data must be an array of strings");
    }
    auto array = dataObj.asArray(runtime);
    auto size = array.size(runtime);
    stringData.reserve(size);
    for (size_t i = 0; i < size; ++i) {
      auto item = array.getValueAtIndex(runtime, i);
      stringData.push_back(item.toString(runtime).utf8(runtime));
    }
  } else {
    if (!isTypedArray(runtime, dataObj)) {
      throw JSError(runtime, "Tensor data must be a TypedArray");
    }
    auto buffer = dataObj.getProperty(runtime, "buffer")
                      .asObject(runtime)
                      .getArrayBuffer(runtime);
    data = buffer.data(runtime);
  }

  std::vector<int64_t> shape;
  auto dimsArray = dimsProperty.asObject(runtime).asArray(runtime);
  for (size_t i = 0; i < dimsArray.size(runtime); ++i) {
    auto dim = dimsArray.getValueAtIndex(runtime, i);
    if (dim.isNumber()) {
      shape.push_back(static_cast<int64_t>(dim.asNumber()));
    }
  }

  if (type == ONNX_TENSOR_ELEMENT_DATA_TYPE_STRING) {
    size_t elementCount = getElementCount(shape);
    if (stringData.size() != elementCount) {
      throw JSError(runtime, "String tensor data length does not match dims");
    }

    std::vector<const char*> stringPointers;
    stringPointers.reserve(stringData.size());
    for (const auto& item : stringData) {
      stringPointers.push_back(item.c_str());
    }

    Ort::AllocatorWithDefaultOptions allocator;
    auto value = Ort::Value::CreateTensor(
        allocator, shape.data(), shape.size(), type);
    value.FillStringTensor(stringPointers.data(), stringPointers.size());
    return value;
  }

  return Ort::Value::CreateTensor(memoryInfo, data,
                                  getElementCount(shape) * getElementSize(type),
                                  shape.data(), shape.size(), type);`;

  if (!source.includes(original)) {
    console.warn('[patch] onnxruntime-react-native TensorUtils string tensor pattern not found.');
    return;
  }

  fs.writeFileSync(tensorUtilsPath, source.replace(original, replacement));
  console.log('[patch] onnxruntime-react-native string tensor creation patched.');
}
