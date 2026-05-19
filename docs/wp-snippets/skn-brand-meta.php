<?php
/**
 * Plugin Name: SkarpeKniver — Brand Term Meta
 * Description: Eksponerer egendefinerte felt på product_brand-taksonomien til
 *              både WP REST (/wp/v2/product_brand) og WC REST (/wc/v3/products/brands).
 * Author: Skarpekniver
 * Version: 1.0.0
 *
 * Plassering: dropp denne filen i wp-content/mu-plugins/skn-brand-meta.php
 * (foretrukket — auto-aktiveres, ikke avhengig av theme).
 *
 * Alternativt: lim hele innholdet (uten <?php-headeren) inn i theme'ets functions.php.
 *
 * Felt som registreres:
 *   - skn_brand_region        Tekst,  f.eks. "Takefu Knife Village, Fukui"
 *   - skn_brand_founded       Tekst,  f.eks. "1979"
 *   - skn_brand_stats         JSON,   f.eks. [{"num":"1979","label":"Grunnlagt"}, ...]
 *   - skn_brand_video_url     Tekst,  YouTube/Vimeo-URL
 *   - skn_brand_hero_image    Tekst,  full bilde-URL (annet enn Woo's `image`-thumbnail)
 *
 * Lese: GET /wp-json/wc/v3/products/brands/<id>     → meta_data[] inneholder feltene
 *       GET /wp-json/wp/v2/product_brand/<id>       → meta-objekt inneholder feltene
 *
 * Skrive: POST/PUT /wp-json/wp/v2/product_brand/<id>?meta[skn_brand_region]=...
 *         (krever auth — bruk Application Password eller BasicAuth med wc-keys
 *          fungerer IKKE på /wp/v2 — bruk Application Password på wp-admin-bruker)
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Felt-definisjoner — én plass for alt.
 */
function skn_brand_meta_fields() {
    return [
        'skn_brand_region'     => [
            'type'        => 'string',
            'description' => 'Region eller smedebydel, f.eks. "Takefu Knife Village, Fukui".',
        ],
        'skn_brand_founded'    => [
            'type'        => 'string',
            'description' => 'År leverandøren ble grunnlagt, f.eks. "1979".',
        ],
        'skn_brand_stats'      => [
            'type'        => 'string',
            'description' => 'JSON-array med opp til 3 stat-kort, f.eks. [{"num":"1979","label":"Grunnlagt"}].',
        ],
        'skn_brand_video_url'  => [
            'type'        => 'string',
            'description' => 'YouTube/Vimeo-URL for embed på brand-side.',
        ],
        'skn_brand_hero_image' => [
            'type'        => 'string',
            'description' => 'Full bilde-URL for hero-banner på /merkevarer/<slug>.',
        ],
    ];
}

/**
 * 1) register_term_meta — gjør feltene synlige + skrivbare på /wp/v2/product_brand.
 *    Hver bruker får én streng per nøkkel ('single' => true).
 */
add_action( 'init', function () {
    foreach ( skn_brand_meta_fields() as $key => $cfg ) {
        register_term_meta( 'product_brand', $key, [
            'type'         => $cfg['type'],
            'description'  => $cfg['description'],
            'single'       => true,
            'show_in_rest' => true,
            'auth_callback' => function () {
                return current_user_can( 'manage_product_terms' )
                    || current_user_can( 'edit_terms', 'product_brand' )
                    || current_user_can( 'manage_options' );
            },
        ] );
    }
} );

/**
 * 2) Eksponer feltene på WC REST som `meta_data[]` slik at frontend-mapperen
 *    kan lese dem på samme form som products.meta_data og kategori-meta.
 *
 *    Skrive-callback gjør det også mulig å oppdatere via WC REST med
 *    samme consumer-keys som for produkter — praktisk for cron/skript som
 *    allerede er autentisert mot WC.
 */
add_action( 'rest_api_init', function () {
    register_rest_field( 'product_brand', 'meta_data', [
        'get_callback'    => function ( $term ) {
            $out = [];
            foreach ( array_keys( skn_brand_meta_fields() ) as $key ) {
                $value = get_term_meta( $term['id'], $key, true );
                if ( $value !== '' && $value !== null && $value !== false ) {
                    $out[] = [ 'key' => $key, 'value' => $value ];
                }
            }
            return $out;
        },
        'update_callback' => function ( $value, $term ) {
            if ( ! is_array( $value ) ) {
                return new WP_Error( 'rest_invalid_param', 'meta_data må være array', [ 'status' => 400 ] );
            }
            $allowed = array_keys( skn_brand_meta_fields() );
            foreach ( $value as $entry ) {
                if ( ! is_array( $entry ) || ! isset( $entry['key'], $entry['value'] ) ) continue;
                if ( ! in_array( $entry['key'], $allowed, true ) ) continue;
                update_term_meta( $term->term_id, $entry['key'], $entry['value'] );
            }
            return true;
        },
        'schema' => [
            'description' => 'Brand-meta felter for SkarpeKniver-frontend.',
            'type'        => 'array',
        ],
    ] );
} );


/**
 * 3) Admin-UI: vis input-felt på "Add new brand"- og "Edit brand"-skjermene
 *    under WooCommerce → Produkter → Brands. Uten dette har feltene ingen
 *    redigeringsplass selv om de finnes i databasen.
 *
 *    Hjelper med ren HTML — ingen JS-avhengigheter, holder seg til samme
 *    layout som Woo bruker for kategori-meta.
 */
function skn_brand_render_field( $key, $cfg, $value, $context = 'edit' ) {
    $label = ucfirst( str_replace( [ 'skn_brand_', '_' ], [ '', ' ' ], $key ) );
    $is_textarea = ( $key === 'skn_brand_stats' );
    $placeholder = '';
    if ( $key === 'skn_brand_stats' ) {
        $placeholder = '[{"num":"1979","label":"Grunnlagt"},{"num":"30+","label":"Smeder"}]';
    } elseif ( $key === 'skn_brand_region' ) {
        $placeholder = 'Takefu Knife Village, Fukui';
    } elseif ( $key === 'skn_brand_founded' ) {
        $placeholder = '1979';
    } elseif ( $key === 'skn_brand_video_url' ) {
        $placeholder = 'https://youtube.com/watch?v=...';
    } elseif ( $key === 'skn_brand_hero_image' ) {
        $placeholder = 'https://www.skarpekniver.com/wp-content/uploads/...jpg';
    }

    if ( $context === 'add' ) {
        echo '<div class="form-field term-' . esc_attr( $key ) . '-wrap">';
        echo '<label for="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label>';
    } else {
        echo '<tr class="form-field term-' . esc_attr( $key ) . '-wrap">';
        echo '<th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th>';
        echo '<td>';
    }

    if ( $is_textarea ) {
        echo '<textarea name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '" rows="4" cols="50" placeholder="' . esc_attr( $placeholder ) . '">' . esc_textarea( $value ) . '</textarea>';
    } else {
        echo '<input type="text" name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '" value="' . esc_attr( $value ) . '" size="40" placeholder="' . esc_attr( $placeholder ) . '" />';
    }

    if ( ! empty( $cfg['description'] ) ) {
        echo '<p class="description">' . esc_html( $cfg['description'] ) . '</p>';
    }

    if ( $context === 'add' ) {
        echo '</div>';
    } else {
        echo '</td></tr>';
    }
}

// Add-form (når du oppretter ny brand)
add_action( 'product_brand_add_form_fields', function () {
    foreach ( skn_brand_meta_fields() as $key => $cfg ) {
        skn_brand_render_field( $key, $cfg, '', 'add' );
    }
} );

// Edit-form (når du redigerer eksisterende brand)
add_action( 'product_brand_edit_form_fields', function ( $term ) {
    foreach ( skn_brand_meta_fields() as $key => $cfg ) {
        $value = get_term_meta( $term->term_id, $key, true );
        skn_brand_render_field( $key, $cfg, $value, 'edit' );
    }
}, 10, 1 );

// Lagre — både ved create og update av brand
add_action( 'created_product_brand', 'skn_brand_save_meta' );
add_action( 'edited_product_brand', 'skn_brand_save_meta' );
function skn_brand_save_meta( $term_id ) {
    foreach ( array_keys( skn_brand_meta_fields() ) as $key ) {
        if ( isset( $_POST[ $key ] ) ) {
            $raw = wp_unslash( $_POST[ $key ] );
            // For tekstarea (stats) bevarer vi linjeskift; for input strippes whitespace.
            $clean = ( $key === 'skn_brand_stats' )
                ? trim( $raw )
                : sanitize_text_field( $raw );
            update_term_meta( $term_id, $key, $clean );
        }
    }
}
