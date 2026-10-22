Pod::Spec.new do |s|
  s.name           = 'ReservedRegions'
  s.version        = '1.0.0'
  s.summary        = 'Screen areas the system reserves over the app (iOS 27.1 reserved regions).'
  s.description    = 'Reports the occlusion reserved regions of the key window, such as a status indicator.'
  s.license        = 'MIT'
  s.author         = 'Tree of Bob'
  s.homepage       = 'https://github.com/prompt-janitor/tree-of-bob'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
