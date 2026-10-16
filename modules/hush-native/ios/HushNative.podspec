Pod::Spec.new do |s|
  s.name           = 'HushNative'
  s.version        = '1.0.0'
  s.summary        = 'Cry detection and push helpers for hush'
  s.description    = 'On-device cry detection (YAMNet) and alert sending for the hush baby monitor.'
  s.author         = 'Mario Ruci'
  s.homepage       = 'https://github.com/MRmarioruci/hush'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'
  s.dependency 'TensorFlowLiteSwift', '~> 2.14'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
  # The model is downloaded by CI (see .github/workflows); it lands in the app bundle.
  s.resources = ['assets/yamnet.tflite']
end
