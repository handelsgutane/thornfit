<?php
/**
 * Plugin Name: SkarpeKniver — Category Upsell Meta
 * Description: Eksponerer skn_default_upsell_product_id på product_cat-
 *              taksonomien så vi kan sette default upsell-produkt per
 *              kategori. Brukes på "Vil du ha med?"-boksen på produktdetaljen.
 *
 * Plassering: lim inn i chef-mu-pluginen ELLER lagre som mu-plugin:
 *   wp-content/mu-plugins/skn-category-upsell-meta.php
 *
 * Bruk i WP-admin:
 *   Produkter → Kategorier → Rediger en kategori → "Default upsell product ID"
 *   Skriv inn produkt-ID-en (tallet) til ønsket upsell-produkt.
 *
 * Bruk via API:
 *   POST /wp-json/wp/v2/product_cat/<term_id>
 *   Body: { "meta": { "skn_default_upsell_product_id": "5149" } }
 *   (Krever Application Password på admin-bruker.)
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * 1) Registrer term-meta så feltet eksponeres i WP REST under term['meta'].
 */
add_action( 'init', function () {
    register_term_meta( 'product_cat', 'skn_default_upsell_product_id', [
        'type'         => 'string',
        'description'  => 'Produkt-ID for default upsell på "Vil du ha med?"-boksen.',
        'single'       => true,
        'show_in_rest' => true,
        'auth_callback' => function () {
            return current_user_can( 'manage_product_terms' )
                || current_user_can( 'edit_terms', 'product_cat' )
                || current_user_can( 'manage_options' );
        },
    ] );
} );

/**
 * 2) Eksponér feltet i meta_data-array på /wc/v3/products/categories slik at
 *    Next.js-frontenden plukker det opp i samme mønster som skn_section_tags.
 *
 *    NB: hvis du allerede har et register_rest_field('product_cat', 'meta_data')
 *    som eksponerer skn_section_tags, må DEN callback-funksjonen utvides til
 *    også å returnere skn_default_upsell_product_id. Da kan denne (2) droppes.
 *    Standalone-versjonen under er trygg hvis det ikke finnes en eksisterende.
 */
add_action( 'rest_api_init', function () {
    // Hvis et meta_data-felt allerede er registrert (f.eks. fra section-tags-
    // pluginen), må du i stedet utvide DEN callback-funksjonen til å
    // også inkludere skn_default_upsell_product_id. Hopp over registreringen
    // her for å unngå konflikt.
    global $wp_rest_additional_fields;
    if ( isset( $wp_rest_additional_fields['product_cat']['meta_data'] ) ) {
        return;
    }

    register_rest_field( 'product_cat', 'meta_data', [
        'get_callback' => function ( $term ) {
            $keys = [
                'skn_section_tags',
                'skn_default_upsell_product_id',
            ];
            $out = [];
            foreach ( $keys as $key ) {
                $value = get_term_meta( $term['id'], $key, true );
                if ( $value !== '' && $value !== null && $value !== false ) {
                    $out[] = [ 'key' => $key, 'value' => $value ];
                }
            }
            return $out;
        },
        'schema' => [
            'description' => 'Term meta exposed for headless frontend.',
            'type'        => 'array',
        ],
    ] );
} );

/**
 * 3) Admin-UI: input-felt på "Edit category"-skjermen.
 */
add_action( 'product_cat_edit_form_fields', function ( $term ) {
    $value = get_term_meta( $term->term_id, 'skn_default_upsell_product_id', true );
    ?>
    <tr class="form-field term-skn-default-upsell-product-id-wrap">
        <th scope="row">
            <label for="skn_default_upsell_product_id">Default upsell product ID</label>
        </th>
        <td>
            <input
                type="text"
                name="skn_default_upsell_product_id"
                id="skn_default_upsell_product_id"
                value="<?php echo esc_attr( $value ); ?>"
                size="20"
                placeholder="5149"
            />
            <p class="description">
                Produkt-ID (tall) for "Vil du ha med?"-boksen på produkter i
                denne kategorien. La stå tom for å bruke global fallback.
                Per-produkt-Upsells (Linked Products → Upsells) overstyrer
                fortsatt denne verdien.
            </p>
        </td>
    </tr>
    <?php
}, 10, 1 );

/**
 * 4) Lagre verdien ved create/update.
 */
function skn_save_category_upsell( $term_id ) {
    if ( isset( $_POST['skn_default_upsell_product_id'] ) ) {
        $raw   = wp_unslash( $_POST['skn_default_upsell_product_id'] );
        $clean = preg_replace( '/[^0-9]/', '', (string) $raw );
        if ( $clean === '' ) {
            delete_term_meta( $term_id, 'skn_default_upsell_product_id' );
        } else {
            update_term_meta( $term_id, 'skn_default_upsell_product_id', $clean );
        }
    }
}
add_action( 'created_product_cat', 'skn_save_category_upsell' );
add_action( 'edited_product_cat', 'skn_save_category_upsell' );
